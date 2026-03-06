const STORAGE_KEY = "arstotzka.notes.v1";

const state = {
  notes: [],
  selectedId: null,
  view: "board",
};

const el = {
  notesContainer: document.getElementById("notes-container"),
  noteForm: document.getElementById("note-form"),
  noteId: document.getElementById("note-id"),
  title: document.getElementById("title"),
  priority: document.getElementById("priority"),
  tags: document.getElementById("tags"),
  mode: document.getElementById("mode"),
  content: document.getElementById("content"),
  dueDate: document.getElementById("due-date"),
  textEditorWrap: document.getElementById("text-editor-wrap"),
  checklistWrap: document.getElementById("checklist-wrap"),
  taskList: document.getElementById("task-list"),
  search: document.getElementById("search"),
  statusFilter: document.getElementById("status-filter"),
  sortOrder: document.getElementById("sort-order"),
  stats: document.getElementById("stats"),
  restoreNote: document.getElementById("restore-note"),
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function defaultNote() {
  return {
    id: uid(),
    title: "",
    priority: "low",
    tags: [],
    mode: "text",
    content: "",
    tasks: [],
    dueDate: "",
    status: "active",
    stamp: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
  };
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(data)) {
      state.notes = data;
      state.selectedId = data[0]?.id ?? null;
    }
  } catch {
    state.notes = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.notes));
}

function playTone(type = "click") {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type === "alarm" ? "sawtooth" : "square";
  o.frequency.value = type === "approve" ? 420 : type === "deny" ? 130 : type === "alarm" ? 90 : 250;
  g.gain.value = 0.0001;
  o.connect(g).connect(ctx.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (type === "alarm" ? 0.9 : 0.14));
  o.stop(ctx.currentTime + (type === "alarm" ? 0.9 : 0.14));
}

function activeFilteredNotes() {
  const q = el.search.value.trim().toLowerCase();
  const filter = el.statusFilter.value;

  return state.notes
    .filter((note) => {
      if (filter !== "all" && note.status !== filter) return false;
      if (!q) return true;
      return [
        note.title,
        note.content,
        note.tags.join(" "),
        note.tasks.map((t) => t.text).join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (el.sortOrder.value === "title") return a.title.localeCompare(b.title);
      if (el.sortOrder.value === "created") return b.createdAt - a.createdAt;
      if (el.sortOrder.value === "priority") {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.priority] - order[b.priority];
      }
      return b.updatedAt - a.updatedAt;
    });
}

function renderStats() {
  const counts = state.notes.reduce((acc, n) => {
    acc.total += 1;
    acc[n.status] += 1;
    if (n.mode === "checklist") {
      acc.tasks += n.tasks.length;
      acc.done += n.tasks.filter((t) => t.done).length;
    }
    return acc;
  }, { total: 0, active: 0, archived: 0, trash: 0, tasks: 0, done: 0 });

  const pct = counts.tasks ? Math.round((counts.done / counts.tasks) * 100) : 0;
  el.stats.innerHTML = `
    <div>Total Records: ${counts.total}</div>
    <div>Active: ${counts.active} | Archived: ${counts.archived} | Rejected: ${counts.trash}</div>
    <div>Checklist Completion: ${pct}% (${counts.done}/${counts.tasks})</div>
  `;
}

function noteSnippet(note) {
  if (note.mode === "checklist") {
    const remaining = note.tasks.filter((t) => !t.done).length;
    return `${note.tasks.length} checklist items • ${remaining} pending`;
  }
  return note.content.slice(0, 120) || "No details entered.";
}

function renderNotes() {
  const notes = activeFilteredNotes();
  const tpl = document.getElementById("note-card-template");
  el.notesContainer.innerHTML = "";
  el.notesContainer.className = `notes ${state.view}-view`;

  if (!notes.length) {
    el.notesContainer.innerHTML = `<p>No records in this queue. Glory to Arstotzka.</p>`;
    return;
  }

  for (const note of notes) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.style.setProperty("--tilt", `${(Math.random() * 2 - 1).toFixed(2)}deg`);
    node.querySelector("h3").textContent = `${note.pinned ? "📌 " : ""}${note.title || "Untitled Record"}`;
    node.querySelector(".snippet").textContent = noteSnippet(note);
    const statusChip = node.querySelector(".chip.status");
    statusChip.classList.add(note.status);
    statusChip.textContent = note.status;
    const p = node.querySelector(".chip.priority");
    p.textContent = note.priority;
    p.classList.add(note.priority);

    node.querySelector(".due").textContent = note.dueDate ? `Due ${note.dueDate}` : "No due date";
    node.querySelector(".tags").innerHTML = note.tags.map((t) => `<span>#${t}</span>`).join("");

    if (note.mode === "checklist") {
      const done = note.tasks.filter((t) => t.done).length;
      node.querySelector(".progress-row").textContent = `Progress: ${done}/${note.tasks.length}`;
    }

    if (note.stamp) {
      node.insertAdjacentHTML("beforeend", `<div class="chip" style="margin-top:6px">Stamped: ${note.stamp}</div>`);
    }

    if (state.selectedId === note.id) node.classList.add("selected");
    node.addEventListener("click", () => selectNote(note.id));
    el.notesContainer.appendChild(node);
  }
}

function renderTasks(tasks = []) {
  el.taskList.innerHTML = "";
  tasks.forEach((task, index) => {
    const row = document.createElement("div");
    row.className = `task-item ${task.done ? "done" : ""}`;
    row.innerHTML = `
      <input type="checkbox" ${task.done ? "checked" : ""} data-action="toggle" data-index="${index}">
      <input type="text" value="${task.text.replace(/"/g, "&quot;")}" data-action="text" data-index="${index}" placeholder="Inspection step" />
      <button type="button" data-action="remove" data-index="${index}">X</button>
    `;
    el.taskList.appendChild(row);
  });
}

function formToNote(base = defaultNote()) {
  const tags = el.tags.value
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const tasks = [...el.taskList.querySelectorAll(".task-item")].map((row) => ({
    text: row.querySelector('input[type="text"]').value.trim(),
    done: row.querySelector('input[type="checkbox"]').checked,
  })).filter((t) => t.text);

  return {
    ...base,
    title: el.title.value.trim(),
    priority: el.priority.value,
    tags,
    mode: el.mode.value,
    content: el.content.value,
    tasks,
    dueDate: el.dueDate.value,
    updatedAt: Date.now(),
  };
}

function fillForm(note) {
  el.noteId.value = note.id;
  el.title.value = note.title;
  el.priority.value = note.priority;
  el.tags.value = note.tags.join(", ");
  el.mode.value = note.mode;
  el.content.value = note.content;
  el.dueDate.value = note.dueDate;
  renderTasks(note.tasks);
  updateModeFields();
  toggleRestore(note.status === "trash");
}

function toggleRestore(show) {
  el.restoreNote.classList.toggle("hidden", !show);
}

function selectNote(id) {
  state.selectedId = id;
  const note = state.notes.find((n) => n.id === id);
  if (note) fillForm(note);
  renderNotes();
}

function updateModeFields() {
  const checklist = el.mode.value === "checklist";
  el.checklistWrap.classList.toggle("hidden", !checklist);
  el.textEditorWrap.classList.toggle("hidden", checklist);
}

function upsertCurrentNote() {
  const currentId = el.noteId.value;
  const existing = state.notes.find((n) => n.id === currentId) || defaultNote();
  const note = formToNote(existing);
  if (!note.title) {
    note.title = "Untitled Record";
  }

  const idx = state.notes.findIndex((n) => n.id === note.id);
  if (idx >= 0) state.notes[idx] = note;
  else state.notes.unshift(note);

  state.selectedId = note.id;
  save();
  renderAll();
  playTone("click");
}

function mutateSelected(mutator) {
  const idx = state.notes.findIndex((n) => n.id === state.selectedId);
  if (idx < 0) return;
  mutator(state.notes[idx]);
  state.notes[idx].updatedAt = Date.now();
  save();
  renderAll();
}

function newNote() {
  const note = defaultNote();
  state.notes.unshift(note);
  state.selectedId = note.id;
  save();
  fillForm(note);
  renderAll();
}

function duplicateSelected() {
  const note = state.notes.find((n) => n.id === state.selectedId);
  if (!note) return;
  const copy = {
    ...structuredClone(note),
    id: uid(),
    title: `${note.title} (Copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "active",
  };
  state.notes.unshift(copy);
  state.selectedId = copy.id;
  save();
  renderAll();
}

function addTaskRow() {
  const row = document.createElement("div");
  row.className = "task-item";
  row.innerHTML = `
    <input type="checkbox" data-action="toggle" />
    <input type="text" data-action="text" placeholder="Inspection step" />
    <button type="button" data-action="remove">X</button>
  `;
  el.taskList.appendChild(row);
}

function stampSelected(mark) {
  mutateSelected((note) => {
    note.stamp = mark;
  });
  playTone(mark === "APPROVED" ? "approve" : "deny");
}

function exportNotes() {
  const blob = new Blob([JSON.stringify(state.notes, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `arstotzka-ledger-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importNotes(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(String(reader.result));
      if (!Array.isArray(incoming)) throw new Error("Invalid format");
      state.notes = incoming;
      state.selectedId = incoming[0]?.id ?? null;
      save();
      renderAll();
    } catch {
      alert("Import failed: file is not a valid ledger.");
    }
  };
  reader.readAsText(file);
}

function runAlarmDrill() {
  document.body.classList.add("alarm");
  playTone("alarm");
  setTimeout(() => document.body.classList.remove("alarm"), 1400);
}

function renderAll() {
  renderStats();
  renderNotes();
  const selected = state.notes.find((n) => n.id === state.selectedId);
  if (selected) fillForm(selected);
  else if (!state.notes.length) {
    const blank = defaultNote();
    fillForm(blank);
    el.noteId.value = "";
  }
}

document.getElementById("new-note").addEventListener("click", newNote);
document.getElementById("duplicate-note").addEventListener("click", duplicateSelected);
document.getElementById("pin-note").addEventListener("click", () => mutateSelected((n) => {
  n.pinned = !n.pinned;
}));
document.getElementById("archive-note").addEventListener("click", () => mutateSelected((n) => {
  n.status = n.status === "archived" ? "active" : "archived";
}));
document.getElementById("trash-note").addEventListener("click", () => mutateSelected((n) => {
  n.status = "trash";
}));
document.getElementById("restore-note").addEventListener("click", () => mutateSelected((n) => {
  n.status = "active";
}));
document.getElementById("stamp-approved").addEventListener("click", () => stampSelected("APPROVED"));
document.getElementById("stamp-denied").addEventListener("click", () => stampSelected("DENIED"));
document.getElementById("add-task").addEventListener("click", addTaskRow);
document.getElementById("export-notes").addEventListener("click", exportNotes);
document.getElementById("import-notes").addEventListener("change", (e) => importNotes(e.target.files[0]));
document.getElementById("panic-mode").addEventListener("click", runAlarmDrill);

el.noteForm.addEventListener("submit", (e) => {
  e.preventDefault();
  upsertCurrentNote();
});

el.mode.addEventListener("change", updateModeFields);
el.search.addEventListener("input", renderNotes);
el.statusFilter.addEventListener("change", renderNotes);
el.sortOrder.addEventListener("change", renderNotes);

document.querySelectorAll(".view-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-toggle").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.view = btn.dataset.view;
    renderNotes();
  });
});

el.taskList.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.action === "remove") {
    target.closest(".task-item")?.remove();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "n" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "")) {
    e.preventDefault();
    newNote();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    upsertCurrentNote();
  }
});

load();
if (!state.notes.length) {
  state.notes = [
    {
      ...defaultNote(),
      title: "Checkpoint briefing",
      content: "Remember to compare expiration dates, seals, and aliases. No exceptions.",
      tags: ["briefing", "daily"],
      priority: "high",
    },
    {
      ...defaultNote(),
      title: "Detainment checklist",
      mode: "checklist",
      tags: ["security"],
      tasks: [
        { text: "Cross-check fingerprints", done: true },
        { text: "Call guard", done: false },
        { text: "Confiscate forged permit", done: false },
      ],
      priority: "medium",
    },
  ];
  state.selectedId = state.notes[0].id;
  save();
}
renderAll();
