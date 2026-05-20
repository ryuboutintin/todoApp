const STORAGE_KEY = "todos";
const PRIORITY_ORDER = ["high", "medium", "low"];
const PRIORITY_LABELS = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};

const todoForm = document.getElementById("todo-form");
const todoInput = document.getElementById("todo-input");
const todoPriority = document.getElementById("todo-priority");
const todoBoard = document.getElementById("todo-board");
const emptyMessage = document.getElementById("empty-message");

let todos = loadTodos();
let draggedTodoId = null;

function loadTodos() {
  const savedTodos = localStorage.getItem(STORAGE_KEY);

  if (!savedTodos) {
    return [];
  }

  try {
    const parsedTodos = JSON.parse(savedTodos).map((todo) => ({
      ...todo,
      priority: todo.priority || "medium",
      order: Number.isFinite(todo.order) ? todo.order : null,
    }));

    return normalizeOrders(parsedTodos);
  } catch (error) {
    console.error("Failed to parse todos from localStorage.", error);
    return [];
  }
}

function saveTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeOrders(todos)));
}

function createPriorityOptions(selectElement, selectedPriority) {
  Object.entries(PRIORITY_LABELS).forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === selectedPriority;
    selectElement.appendChild(option);
  });
}

function normalizeOrders(todoItems) {
  const normalized = [];

  PRIORITY_ORDER.forEach((priority) => {
    const items = todoItems
      .filter((todo) => todo.priority === priority)
      .sort((a, b) => {
        const aOrder = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
        const bOrder = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;

        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }

        return a.id - b.id;
      })
      .map((todo, index) => ({
        ...todo,
        priority,
        order: index,
      }));

    normalized.push(...items);
  });

  return normalized;
}

function getTodosByPriority(priority) {
  return todos
    .filter((todo) => todo.priority === priority)
    .sort((a, b) => a.order - b.order);
}

function setTodosByPriority(priority, items) {
  const normalizedItems = items.map((todo, index) => ({
    ...todo,
    priority,
    order: index,
  }));

  todos = [
    ...todos.filter((todo) => todo.priority !== priority),
    ...normalizedItems,
  ];
}

function clearDropIndicators() {
  document.querySelectorAll(".drop-before, .drop-after").forEach((element) => {
    element.classList.remove("drop-before", "drop-after");
  });

  document.querySelectorAll(".drop-target").forEach((element) => {
    element.classList.remove("drop-target");
  });
}

function createTodoItem(todo) {
  const listItem = document.createElement("li");
  listItem.className = `todo-item priority-${todo.priority}${todo.completed ? " completed" : ""}`;
  listItem.draggable = true;
  listItem.dataset.id = String(todo.id);
  listItem.dataset.priority = todo.priority;
  listItem.addEventListener("dragstart", handleDragStart);
  listItem.addEventListener("dragend", handleDragEnd);
  listItem.addEventListener("dragover", handleItemDragOver);
  listItem.addEventListener("dragleave", handleItemDragLeave);
  listItem.addEventListener("drop", handleItemDrop);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "todo-checkbox";
  checkbox.checked = todo.completed;
  checkbox.addEventListener("change", () => toggleTodo(todo.id));

  const content = document.createElement("div");
  content.className = "todo-content";

  const text = document.createElement("span");
  text.className = "todo-text";
  text.textContent = todo.text;

  const priorityBadge = document.createElement("span");
  priorityBadge.className = "priority-badge";
  priorityBadge.textContent = `우선순위: ${PRIORITY_LABELS[todo.priority]}`;

  const prioritySelect = document.createElement("select");
  prioritySelect.className = "priority-select";
  createPriorityOptions(prioritySelect, todo.priority);
  prioritySelect.addEventListener("change", (event) => {
    updatePriority(todo.id, event.target.value);
  });

  const meta = document.createElement("div");
  meta.className = "todo-meta";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-button";
  deleteButton.textContent = "삭제";
  deleteButton.addEventListener("click", () => deleteTodo(todo.id));

  meta.append(priorityBadge, prioritySelect);
  content.append(text, meta);
  listItem.append(checkbox, content, deleteButton);

  return listItem;
}

function buildPriorityColumn(priority) {
  const column = document.createElement("section");
  column.className = "priority-column";
  column.dataset.priority = priority;
  column.addEventListener("dragover", handleColumnDragOver);
  column.addEventListener("dragleave", handleColumnDragLeave);
  column.addEventListener("drop", handleColumnDrop);

  const header = document.createElement("div");
  header.className = "priority-header";

  const title = document.createElement("h2");
  title.className = "priority-title";
  title.textContent = `${PRIORITY_LABELS[priority]} 우선순위`;

  const items = getTodosByPriority(priority);

  const count = document.createElement("span");
  count.className = "priority-count";
  count.textContent = `${items.length}개`;

  const list = document.createElement("ul");
  list.className = "todo-list";
  list.dataset.priority = priority;
  list.addEventListener("dragover", handleListDragOver);
  list.addEventListener("dragleave", handleListDragLeave);
  list.addEventListener("drop", handleListDrop);

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "column-empty";
    empty.textContent = "여기로 할 일을 끌어오세요";
    list.appendChild(empty);
  } else {
    items.forEach((todo) => {
      list.appendChild(createTodoItem(todo));
    });
  }

  header.append(title, count);
  column.append(header, list);

  return column;
}

function renderTodos() {
  todoBoard.innerHTML = "";

  if (todos.length === 0) {
    emptyMessage.hidden = false;
    return;
  }

  emptyMessage.hidden = true;
  PRIORITY_ORDER.forEach((priority) => {
    todoBoard.appendChild(buildPriorityColumn(priority));
  });
}

function addTodo(text, priority) {
  const nextOrder = getTodosByPriority(priority).length;

  todos.push({
    id: Date.now(),
    text,
    completed: false,
    priority,
    order: nextOrder,
  });

  todos = normalizeOrders(todos);
  saveTodos();
  renderTodos();
}

function toggleTodo(id) {
  todos = todos.map((todo) =>
    todo.id === id ? { ...todo, completed: !todo.completed } : todo
  );

  saveTodos();
  renderTodos();
}

function updatePriority(id, priority) {
  const todoToMove = todos.find((todo) => todo.id === id);

  if (!todoToMove) {
    return;
  }

  if (todoToMove.priority === priority) {
    return;
  }

  const sourceItems = getTodosByPriority(todoToMove.priority).filter(
    (todo) => todo.id !== id
  );
  const targetItems = getTodosByPriority(priority);

  setTodosByPriority(todoToMove.priority, sourceItems);
  setTodosByPriority(priority, [...targetItems, { ...todoToMove, priority }]);
  todos = normalizeOrders(todos);

  saveTodos();
  renderTodos();
}

function moveTodo(draggedId, targetPriority, targetId = null, position = "end") {
  const draggedTodo = todos.find((todo) => todo.id === draggedId);

  if (!draggedTodo) {
    return;
  }

  const sourcePriority = draggedTodo.priority;
  const sourceItems = getTodosByPriority(sourcePriority).filter(
    (todo) => todo.id !== draggedId
  );
  const targetItems =
    sourcePriority === targetPriority
      ? [...sourceItems]
      : [...getTodosByPriority(targetPriority)];

  let insertIndex = targetItems.length;

  if (targetId !== null) {
    const foundIndex = targetItems.findIndex((todo) => todo.id === targetId);

    if (foundIndex !== -1) {
      insertIndex = position === "after" ? foundIndex + 1 : foundIndex;
    }
  }

  targetItems.splice(insertIndex, 0, { ...draggedTodo, priority: targetPriority });

  if (sourcePriority === targetPriority) {
    setTodosByPriority(sourcePriority, targetItems);
  } else {
    setTodosByPriority(sourcePriority, sourceItems);
    setTodosByPriority(targetPriority, targetItems);
  }

  todos = normalizeOrders(todos);
  saveTodos();
  renderTodos();
}

function handleDragStart(event) {
  draggedTodoId = Number(event.currentTarget.dataset.id);
  event.currentTarget.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(draggedTodoId));
}

function handleDragEnd(event) {
  event.currentTarget.classList.remove("dragging");
  draggedTodoId = null;
  clearDropIndicators();
}

function handleItemDragOver(event) {
  event.preventDefault();
  event.stopPropagation();

  const item = event.currentTarget;
  const rect = item.getBoundingClientRect();
  const isBefore = event.clientY < rect.top + rect.height / 2;

  clearDropIndicators();
  item.classList.add(isBefore ? "drop-before" : "drop-after");
}

function handleItemDragLeave(event) {
  event.currentTarget.classList.remove("drop-before", "drop-after");
}

function handleItemDrop(event) {
  event.preventDefault();
  event.stopPropagation();

  const item = event.currentTarget;
  const targetId = Number(item.dataset.id);
  const targetPriority = item.dataset.priority;
  const rect = item.getBoundingClientRect();
  const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";

  clearDropIndicators();

  if (draggedTodoId === null || draggedTodoId === targetId) {
    return;
  }

  moveTodo(draggedTodoId, targetPriority, targetId, position);
}

function handleListDragOver(event) {
  event.preventDefault();
  event.stopPropagation();

  if (event.target.closest(".todo-item")) {
    return;
  }

  clearDropIndicators();
  event.currentTarget.classList.add("drop-target");
}

function handleListDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove("drop-target");
  }
}

function handleListDrop(event) {
  event.preventDefault();
  event.stopPropagation();

  const list = event.currentTarget;

  clearDropIndicators();

  if (draggedTodoId === null) {
    return;
  }

  moveTodo(draggedTodoId, list.dataset.priority);
}

function handleColumnDragOver(event) {
  event.preventDefault();

  if (event.target.closest(".todo-item")) {
    return;
  }

  clearDropIndicators();
  event.currentTarget.classList.add("drop-target");
}

function handleColumnDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove("drop-target");
  }
}

function handleColumnDrop(event) {
  event.preventDefault();

  if (event.target.closest(".todo-item")) {
    return;
  }

  clearDropIndicators();

  if (draggedTodoId === null) {
    return;
  }

  moveTodo(draggedTodoId, event.currentTarget.dataset.priority);
}

function deleteTodo(id) {
  todos = todos.filter((todo) => todo.id !== id);
  todos = normalizeOrders(todos);
  saveTodos();
  renderTodos();
}

todoForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = todoInput.value.trim();

  if (!text) {
    todoInput.focus();
    return;
  }

  addTodo(text, todoPriority.value);
  todoInput.value = "";
  todoPriority.value = "medium";
  todoInput.focus();
});

renderTodos();
