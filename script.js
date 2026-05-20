const STORAGE_KEY = "todos";
const SUPABASE_TABLE = "todos";
const PRIORITY_ORDER = ["high", "medium", "low"];
const PRIORITY_LABELS = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};
const SUPABASE_URL = "https://eecdvkrhokismqhcaoko.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlY2R2a3Job2tpc21xaGNhb2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMDQ3ODUsImV4cCI6MjA5NDc4MDc4NX0.rwvkGOlvASXyktRogLMdS1AC22QJ36C4B7A9wPHMm1w";
const OAUTH_PENDING_STORAGE_KEY = "pending-oauth-provider";
const OAUTH_PROVIDERS = ["google", "github"];

const supabaseClient =
  window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY) ?? null;

const authPanel = document.getElementById("auth-panel");
const authForm = document.getElementById("auth-form");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authStatus = document.getElementById("auth-status");
const signupButton = document.getElementById("signup-button");
const googleLoginButton = document.getElementById("google-login-button");
const githubLoginButton = document.getElementById("github-login-button");
const sessionBar = document.getElementById("session-bar");
const sessionEmail = document.getElementById("session-email");
const logoutButton = document.getElementById("logout-button");
const todoShell = document.getElementById("todo-shell");
const todoForm = document.getElementById("todo-form");
const todoInput = document.getElementById("todo-input");
const todoPriority = document.getElementById("todo-priority");
const todoBoard = document.getElementById("todo-board");
const emptyMessage = document.getElementById("empty-message");
const syncStatus = document.getElementById("sync-status");

let todos = [];
let draggedTodoId = null;
let currentUser = null;
let currentUserId = null;
let authRequestInFlight = false;

function setSyncStatus(message, tone = "info") {
  syncStatus.textContent = message;
  syncStatus.dataset.tone = tone;
}

function setAuthStatus(message, tone = "info") {
  authStatus.textContent = message;
  authStatus.dataset.tone = tone;
}

function setAuthControlsDisabled(disabled) {
  authRequestInFlight = disabled;
  authEmail.disabled = disabled;
  authPassword.disabled = disabled;
  signupButton.disabled = disabled;
  googleLoginButton.disabled = disabled;
  githubLoginButton.disabled = disabled;
}

function getAuthErrorMessage(error, action) {
  const rawMessage = error?.message ?? "";
  const normalizedMessage = rawMessage.toLowerCase();

  if (normalizedMessage.includes("email rate limit exceeded")) {
    return "다른 이메일로 바꿔 입력할 수는 있지만, 지금은 Supabase 메일 발송 한도에 걸려 새 인증 메일을 바로 보낼 수 없습니다. 잠시 후 다시 시도하거나 SMTP 설정을 늘려야 합니다.";
  }

  if (normalizedMessage.includes("user already registered")) {
    return "이미 가입된 이메일입니다. 로그인으로 진행하세요.";
  }

  if (normalizedMessage.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }

  if (normalizedMessage.includes("email not confirmed")) {
    return "이메일 인증이 아직 완료되지 않았습니다. 메일함에서 인증을 먼저 완료하세요.";
  }

  if (action === "signup") {
    return "회원가입에 실패했습니다. 입력한 이메일과 비밀번호를 확인하세요.";
  }

  if (action === "login") {
    return "로그인에 실패했습니다. 입력한 이메일과 비밀번호를 확인하세요.";
  }

  return rawMessage || "인증 요청을 처리하지 못했습니다.";
}

function getOAuthErrorMessage(error, provider) {
  const rawMessage = error?.message ?? "";
  const normalizedMessage = rawMessage.toLowerCase();
  const providerLabel = getProviderLabel(provider);

  if (normalizedMessage.includes("unsupported provider")) {
    return `${providerLabel} 로그인이 Supabase 프로젝트에서 활성화되지 않았습니다. Supabase Dashboard > Authentication > Providers에서 ${providerLabel}를 켜고 Client ID/Secret을 저장하세요.`;
  }

  if (normalizedMessage.includes("redirect")) {
    return `${providerLabel} 로그인 Redirect URL 설정을 확인하세요.`;
  }

  return `${providerLabel} 로그인을 시작하지 못했습니다.`;
}

function isFileProtocol() {
  return window.location.protocol === "file:";
}

function getRedirectUrl() {
  return window.location.origin + window.location.pathname;
}

function setPendingOAuthProvider(provider) {
  if (!OAUTH_PROVIDERS.includes(provider)) {
    return;
  }

  sessionStorage.setItem(OAUTH_PENDING_STORAGE_KEY, provider);
}

function getPendingOAuthProvider() {
  const provider = sessionStorage.getItem(OAUTH_PENDING_STORAGE_KEY);
  return OAUTH_PROVIDERS.includes(provider) ? provider : null;
}

function clearPendingOAuthProvider() {
  sessionStorage.removeItem(OAUTH_PENDING_STORAGE_KEY);
}

function getProviderLabel(provider) {
  if (provider === "google") {
    return "Google";
  }

  if (provider === "github") {
    return "GitHub";
  }

  return "소셜";
}

function readOAuthRedirectState() {
  const url = new URL(window.location.href);
  const errorDescription = url.searchParams.get("error_description");
  const error = url.searchParams.get("error");
  const errorCode = url.searchParams.get("error_code");
  const authCode = url.searchParams.get("code");

  return {
    error: errorDescription || error || errorCode,
    hasAuthCode: Boolean(authCode),
  };
}

function clearOAuthRedirectParams() {
  const url = new URL(window.location.href);
  const removableKeys = ["code", "error", "error_code", "error_description"];
  let changed = false;

  removableKeys.forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });

  if (changed) {
    window.history.replaceState({}, document.title, url.toString());
  }
}

function compareTodoIds(aId, bId) {
  return String(aId).localeCompare(String(bId), "ko");
}

function normalizeTodoRecord(todo) {
  return {
    ...todo,
    priority: PRIORITY_ORDER.includes(todo.priority) ? todo.priority : "medium",
    order: Number.isFinite(todo.order) ? todo.order : Number(todo.sort_order) || 0,
  };
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

        return compareTodoIds(a.id, b.id);
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

function createPriorityOptions(selectElement, selectedPriority) {
  Object.entries(PRIORITY_LABELS).forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === selectedPriority;
    selectElement.appendChild(option);
  });
}

function setSessionUI(isLoggedIn) {
  authPanel.hidden = isLoggedIn;
  sessionBar.hidden = !isLoggedIn;
  todoShell.hidden = !isLoggedIn;

  if (!isLoggedIn) {
    sessionEmail.textContent = "";
    todoBoard.innerHTML = "";
    emptyMessage.hidden = false;
  }
}

function clearTodoState() {
  todos = [];
  draggedTodoId = null;
  renderTodos();
}

function requireAuthenticated() {
  if (!currentUserId) {
    setSyncStatus("로그인이 필요합니다.", "warning");
    setAuthStatus("이메일 인증을 완료한 계정으로 로그인하세요.", "warning");
    return false;
  }

  return true;
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
  checkbox.addEventListener("change", () => {
    void toggleTodo(todo.id);
  });

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
    void updatePriority(todo.id, event.target.value);
  });

  const meta = document.createElement("div");
  meta.className = "todo-meta";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-button";
  deleteButton.textContent = "삭제";
  deleteButton.addEventListener("click", () => {
    void deleteTodo(todo.id);
  });

  meta.append(priorityBadge, prioritySelect);
  content.append(text, meta);
  listItem.append(checkbox, content, deleteButton);

  return listItem;
}

function getTodosByPriority(priority) {
  return todos
    .filter((todo) => todo.priority === priority)
    .sort((a, b) => a.order - b.order);
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

function createSupabasePayload(todo) {
  return {
    id: todo.id,
    user_id: currentUserId,
    text: todo.text,
    completed: todo.completed,
    priority: todo.priority,
    sort_order: todo.order,
  };
}

async function fetchRemoteTodos() {
  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select("id, text, completed, priority, sort_order")
    .eq("user_id", currentUserId);

  if (error) {
    throw error;
  }

  return normalizeOrders((data ?? []).map(normalizeTodoRecord));
}

async function syncAllTodosToSupabase(todoItems) {
  const remoteTodos = todoItems.filter(
    (todo) => typeof todo.id === "string" && todo.id.length > 0
  );

  if (remoteTodos.length === 0) {
    return;
  }

  const { error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .upsert(remoteTodos.map(createSupabasePayload), { onConflict: "id" });

  if (error) {
    throw error;
  }
}

async function loadTodosForCurrentUser() {
  if (!requireAuthenticated()) {
    return;
  }

  setSyncStatus("Supabase에서 할 일을 불러오는 중입니다.", "info");

  try {
    todos = await fetchRemoteTodos();
    renderTodos();
    setSyncStatus("Supabase와 동기화되었습니다.", "success");
  } catch (error) {
    console.error("Failed to load todos.", error);
    clearTodoState();
    setSyncStatus("할 일을 불러오지 못했습니다. RLS 정책과 로그인 상태를 확인하세요.", "error");
  }
}

async function addTodo(text, priority) {
  if (!requireAuthenticated()) {
    return;
  }

  const nextOrder = getTodosByPriority(priority).length;
  setSyncStatus("Supabase에 저장하는 중입니다.", "info");

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .insert({
      user_id: currentUserId,
      text,
      completed: false,
      priority,
      sort_order: nextOrder,
    })
    .select("id, text, completed, priority, sort_order")
    .single();

  if (error) {
    console.error("Failed to add todo.", error);
    setSyncStatus("할 일을 저장하지 못했습니다.", "error");
    return;
  }

  todos = normalizeOrders([...todos, normalizeTodoRecord(data)]);
  renderTodos();
  setSyncStatus("Supabase에 저장되었습니다.", "success");
}

async function toggleTodo(id) {
  if (!requireAuthenticated()) {
    return;
  }

  const nextTodos = normalizeOrders(
    todos.map((todo) =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    )
  );

  todos = nextTodos;
  renderTodos();

  try {
    await syncAllTodosToSupabase(todos);
    setSyncStatus("Supabase와 동기화되었습니다.", "success");
  } catch (error) {
    console.error("Failed to toggle todo.", error);
    setSyncStatus("완료 상태를 저장하지 못했습니다.", "error");
    await loadTodosForCurrentUser();
  }
}

async function updatePriority(id, priority) {
  if (!requireAuthenticated()) {
    return;
  }

  const todoToMove = todos.find((todo) => todo.id === id);

  if (!todoToMove || todoToMove.priority === priority) {
    return;
  }

  const nextTodos = normalizeOrders(
    todos.map((todo) =>
      todo.id === id ? { ...todo, priority } : todo
    )
  );

  todos = nextTodos;
  renderTodos();

  try {
    await syncAllTodosToSupabase(todos);
    setSyncStatus("Supabase와 동기화되었습니다.", "success");
  } catch (error) {
    console.error("Failed to update priority.", error);
    setSyncStatus("우선순위를 저장하지 못했습니다.", "error");
    await loadTodosForCurrentUser();
  }
}

function moveTodo(draggedId, targetPriority, targetId = null, position = "end") {
  if (!requireAuthenticated()) {
    return;
  }

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

  const nextTodos = normalizeOrders([
    ...todos.filter(
      (todo) =>
        todo.priority !== sourcePriority && todo.priority !== targetPriority
    ),
    ...(sourcePriority === targetPriority ? targetItems : sourceItems),
    ...(sourcePriority === targetPriority ? [] : targetItems),
  ]);

  todos = nextTodos;
  renderTodos();

  void syncAllTodosToSupabase(todos)
    .then(() => {
      setSyncStatus("Supabase와 동기화되었습니다.", "success");
    })
    .catch(async (error) => {
      console.error("Failed to reorder todos.", error);
      setSyncStatus("순서를 저장하지 못했습니다.", "error");
      await loadTodosForCurrentUser();
    });
}

async function deleteTodo(id) {
  if (!requireAuthenticated()) {
    return;
  }

  const nextTodos = normalizeOrders(todos.filter((todo) => todo.id !== id));
  todos = nextTodos;
  renderTodos();

  try {
    const { error } = await supabaseClient
      .from(SUPABASE_TABLE)
      .delete()
      .eq("id", id)
      .eq("user_id", currentUserId);

    if (error) {
      throw error;
    }

    await syncAllTodosToSupabase(todos);
    setSyncStatus("Supabase와 동기화되었습니다.", "success");
  } catch (error) {
    console.error("Failed to delete todo.", error);
    setSyncStatus("할 일을 삭제하지 못했습니다.", "error");
    await loadTodosForCurrentUser();
  }
}

function handleDragStart(event) {
  draggedTodoId = event.currentTarget.dataset.id;
  event.currentTarget.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedTodoId);
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
  const targetId = item.dataset.id;
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

  clearDropIndicators();

  if (draggedTodoId === null) {
    return;
  }

  moveTodo(draggedTodoId, event.currentTarget.dataset.priority);
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

async function signUpWithEmail() {
  if (!supabaseClient) {
    return;
  }

  if (authRequestInFlight) {
    return;
  }

  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password) {
    setAuthStatus("이메일과 비밀번호를 모두 입력하세요.", "warning");
    return;
  }

  if (!authEmail.checkValidity()) {
    setAuthStatus("이메일 형식이 올바른지 확인하세요.", "warning");
    authEmail.focus();
    return;
  }

  setAuthStatus("회원가입을 처리하는 중입니다.", "info");
  setAuthControlsDisabled(true);

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
  });

  if (error) {
    console.error("Failed to sign up.", error);
    setAuthStatus(getAuthErrorMessage(error, "signup"), "error");
    setAuthControlsDisabled(false);
    return;
  }

  if (data.session) {
    await supabaseClient.auth.signOut();
  }

  setAuthStatus("인증 메일을 확인한 뒤 로그인하세요.", "success");
  setSyncStatus("이메일을 잘못 입력했으면 바로 다른 이메일로 다시 회원가입할 수 있습니다. 다만 Supabase 기본 메일 발송 한도에 걸리면 새 메일은 잠시 후에만 발송됩니다.", "info");
  authPassword.value = "";
  setAuthControlsDisabled(false);
}

async function loginWithEmail() {
  if (!supabaseClient) {
    return;
  }

  if (authRequestInFlight) {
    return;
  }

  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password) {
    setAuthStatus("이메일과 비밀번호를 모두 입력하세요.", "warning");
    return;
  }

  setAuthStatus("로그인 중입니다.", "info");
  setAuthControlsDisabled(true);

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Failed to sign in.", error);
    setAuthStatus(getAuthErrorMessage(error, "login"), "error");
    setSyncStatus("로그인에 실패했습니다.", "error");
    setAuthControlsDisabled(false);
    return;
  }

  authPassword.value = "";
  setAuthControlsDisabled(false);
}

async function logout() {
  if (!supabaseClient) {
    return;
  }

  clearPendingOAuthProvider();

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    console.error("Failed to sign out.", error);
    setSyncStatus("로그아웃하지 못했습니다.", "error");
    return;
  }

  setAuthStatus("로그아웃되었습니다.", "info");
}

async function signInWithOAuth(provider) {
  if (!supabaseClient || authRequestInFlight) {
    return;
  }

  if (!OAUTH_PROVIDERS.includes(provider)) {
    setAuthStatus("지원하지 않는 로그인 방식입니다.", "error");
    return;
  }

  const providerLabel = getProviderLabel(provider);
  setPendingOAuthProvider(provider);
  setAuthStatus(`${providerLabel} 로그인 페이지로 이동하는 중입니다.`, "info");
  setSyncStatus(`${providerLabel} 인증을 준비하는 중입니다.`, "info");
  setAuthControlsDisabled(true);

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: getRedirectUrl(),
    },
  });

  if (error) {
    console.error(`Failed to sign in with ${provider}.`, error);
    clearPendingOAuthProvider();
    setAuthStatus(getOAuthErrorMessage(error, provider), "error");
    setSyncStatus(getOAuthErrorMessage(error, provider), "error");
    setAuthControlsDisabled(false);
  }
}

async function applySession(session) {
  currentUser = session?.user ?? null;
  currentUserId = currentUser?.id ?? null;
  setSessionUI(Boolean(currentUser));

  if (!currentUser) {
    clearTodoState();
    setAuthControlsDisabled(false);
    setSyncStatus("로그인 후 Todo를 사용할 수 있습니다.", "warning");
    return;
  }

  clearPendingOAuthProvider();
  sessionEmail.textContent = currentUser.email ?? "이메일 비공개 계정";
  setAuthStatus("로그인되었습니다.", "success");
  setAuthControlsDisabled(false);
  await loadTodosForCurrentUser();
}

function registerEvents() {
  authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void loginWithEmail();
  });

  signupButton.addEventListener("click", () => {
    void signUpWithEmail();
  });

  googleLoginButton.addEventListener("click", () => {
    void signInWithOAuth("google");
  });

  githubLoginButton.addEventListener("click", () => {
    void signInWithOAuth("github");
  });

  logoutButton.addEventListener("click", () => {
    void logout();
  });

  todoForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const text = todoInput.value.trim();

    if (!text) {
      todoInput.focus();
      return;
    }

    void addTodo(text, todoPriority.value);
    todoInput.value = "";
    todoPriority.value = "medium";
    todoInput.focus();
  });
}

async function initializeApp() {
  const pendingOAuthProvider = getPendingOAuthProvider();
  const oauthRedirectState = readOAuthRedirectState();
  localStorage.removeItem(STORAGE_KEY);
  registerEvents();

  if (isFileProtocol()) {
    setSyncStatus("file:// 대신 로컬 서버(http://localhost)로 실행해야 Supabase 연결이 안정적입니다.", "warning");
  }

  if (!supabaseClient) {
    setSessionUI(false);
    setAuthStatus("Supabase 클라이언트를 초기화하지 못했습니다.", "error");
    setSyncStatus("Supabase 설정을 확인하세요.", "error");
    return;
  }

  if (pendingOAuthProvider && oauthRedirectState.error) {
    const providerLabel = getProviderLabel(pendingOAuthProvider);
    setAuthStatus(`${providerLabel} 로그인에 실패했습니다. 권한 승인과 Redirect URL 설정을 확인하세요.`, "error");
    setSyncStatus("소셜 로그인에 실패했습니다.", "error");
    clearPendingOAuthProvider();
    setAuthControlsDisabled(false);
    clearOAuthRedirectParams();
  } else if (pendingOAuthProvider && oauthRedirectState.hasAuthCode) {
    const providerLabel = getProviderLabel(pendingOAuthProvider);
    setAuthStatus(`${providerLabel} 로그인 결과를 확인하는 중입니다.`, "info");
    setSyncStatus(`${providerLabel} 계정을 확인하는 중입니다.`, "info");
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      clearOAuthRedirectParams();
    }

    void applySession(session);
  });

  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Failed to get session.", error);
    setSessionUI(false);
    setAuthStatus("세션을 확인하지 못했습니다.", "error");
    setSyncStatus("인증 상태를 확인하지 못했습니다.", "error");
    return;
  }

  if (
    pendingOAuthProvider &&
    !oauthRedirectState.error &&
    !oauthRedirectState.hasAuthCode &&
    !session
  ) {
    clearPendingOAuthProvider();
  }

  setAuthStatus("로그인이 필요합니다.", "info");
  await applySession(session);
}

void initializeApp();
