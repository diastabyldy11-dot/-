const defaultProfile = {
    name: "Ученик",
    email: "student@example.com",
    school: "Без школы"
};

let profile = { ...defaultProfile, ...(JSON.parse(localStorage.getItem("deadlineBossProfile") || "{}")) };
let currentTheme = localStorage.getItem("deadlineBossTheme") || "dark";

function applyTheme(theme) {
    currentTheme = theme;
    document.body.classList.toggle("theme-light", theme === "light");
    document.body.classList.toggle("theme-dark", theme === "dark");
    document.getElementById("themeToggle").textContent = theme === "dark" ? "☼" : "☾";
    localStorage.setItem("deadlineBossTheme", theme);
}

function toggleTheme() {
    applyTheme(currentTheme === "dark" ? "light" : "dark");
}

/* =========================
   ЗАДАЧИ И СОСТОЯНИЕ
========================= */

function normalizeTask(task) {
    return {
        ...task,
        subtasks: Array.isArray(task.subtasks)
            ? task.subtasks.map(subtask => ({
                id: subtask.id || Date.now().toString() + Math.random().toString(16).slice(2),
                title: String(subtask.title || "").trim(),
                completed: Boolean(subtask.completed)
            })).filter(subtask => subtask.title)
            : [],
        attachments: Array.isArray(task.attachments)
            ? task.attachments.map(attachment => ({
                id: attachment.id || Date.now().toString(),
                name: attachment.name || "Неизвестный файл",
                type: attachment.type || "application/octet-stream",
                size: Number(attachment.size) || 0,
                uploadedAt: attachment.uploadedAt || new Date().toISOString()
            }))
            : []
    };
}

let tasks = JSON.parse(
    localStorage.getItem("deadlineBossTasks") || "[]"
).map(normalizeTask);

const pageName = document.body.dataset.page || "all";
let currentSection = pageName === "tasks" ? "all" : pageName;
let selectedTask = null;
const MAX_ATTACHMENT_SIZE = 40 * 1024 * 1024;
let attachmentDatabase = null;

function openAttachmentDatabase() {
    if (!("indexedDB" in window)) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open("deadlineBossAttachments", 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains("attachments")) {
                database.createObjectStore("attachments", { keyPath: "id" });
            }
        };
        request.onsuccess = () => {
            attachmentDatabase = request.result;
            resolve(attachmentDatabase);
        };
        request.onerror = () => reject(request.error);
    });
}

function saveAttachment(taskId, file) {
    return new Promise((resolve, reject) => {
        if (!attachmentDatabase) {
            reject(new Error("IndexedDB недоступен"));
            return;
        }

        const transaction = attachmentDatabase.transaction("attachments", "readwrite");
        const store = transaction.objectStore("attachments");
        const attachmentId = `${taskId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const record = {
            id: attachmentId,
            taskId,
            fileName: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            uploadedAt: new Date().toISOString(),
            blob: file
        };

        const request = store.put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = () => reject(request.error);
    });
}

function deleteAttachment(attachmentId) {
    return new Promise((resolve, reject) => {
        if (!attachmentDatabase) {
            resolve();
            return;
        }

        const transaction = attachmentDatabase.transaction("attachments", "readwrite");
        const request = transaction.objectStore("attachments").delete(attachmentId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/* Сохранение задач */
function saveTasks() {
    localStorage.setItem(
        "deadlineBossTasks",
        JSON.stringify(tasks)
    );
}

/* Проверка просрочки */
function isOverdue(task) {
    return (
        !task.completed &&
        new Date(task.deadline) < new Date()
    );
}

function getTaskProgress(task) {
    const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const total = subtasks.length;
    if (!total) {
        return { total: 0, done: 0, percent: 0 };
    }

    const done = subtasks.filter(subtask => subtask.completed).length;
    return {
        total,
        done,
        percent: Math.round((done / total) * 100)
    };
}

/* Название приоритета */
function priorityName(priority) {
    if (priority === "high") return "Высокий";
    if (priority === "medium") return "Средний";
    return "Низкий";
}

/* Формат даты */
function formatDate(date) {
    return new Date(date).toLocaleString(
        "ru-RU",
        {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}

const REMINDER_WINDOW_MS = 15 * 60 * 1000;
let notifiedTaskIds = new Set(
    JSON.parse(localStorage.getItem("deadlineBossNotifiedTasks") || "[]")
);

function saveNotifiedTaskIds() {
    localStorage.setItem(
        "deadlineBossNotifiedTasks",
        JSON.stringify([...notifiedTaskIds])
    );
}

function showDeadlineReminder() {
    const now = Date.now();
    const reminderTask = tasks.find(task => {
        if (task.completed) return false;

        const deadline = new Date(task.deadline).getTime();
        return deadline > now && deadline - now <= REMINDER_WINDOW_MS;
    });

    if (!reminderTask || notifiedTaskIds.has(reminderTask.id)) return;

    const reminderModal = document.getElementById("deadlineReminderModal");
    const reminderTitle = document.getElementById("deadlineReminderTitle");
    const reminderMessage = document.getElementById("deadlineReminderMessage");

    if (!reminderModal || !reminderTitle || !reminderMessage) return;

    reminderTitle.textContent = "Сдача через 15 минут";
    reminderMessage.textContent = `Задача «${reminderTask.title}» нужно сдать до ${formatDate(reminderTask.deadline)}.`;
    reminderModal.classList.remove("hidden");
    notifiedTaskIds.add(reminderTask.id);
    saveNotifiedTaskIds();
}

function closeDeadlineReminder() {
    const reminderModal = document.getElementById("deadlineReminderModal");
    if (reminderModal) reminderModal.classList.add("hidden");
}

function ensureDeadlineReminderModal() {
    if (document.getElementById("deadlineReminderModal")) return;

    document.body.insertAdjacentHTML("beforeend", `
        <div class="modal hidden" id="deadlineReminderModal" role="dialog" aria-modal="true" aria-labelledby="deadlineReminderTitle">
            <div class="modal-box reminder-modal-box">
                <h2 id="deadlineReminderTitle">Сдача через 15 минут</h2>
                <p id="deadlineReminderMessage"></p>
                <div class="modal-buttons">
                    <button class="save" type="button" onclick="closeDeadlineReminder()">Понял</button>
                </div>
            </div>
        </div>
    `);
}

/* Защита от XSS */
function escapeHTML(text) {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* =========================
   ОТОБРАЖЕНИЕ ЗАДАЧ
========================= */

function renderTasks() {
    const list = document.getElementById("taskList");
    if (!list) return;

    let visibleTasks = tasks;

    if (currentSection === "completed") {
        visibleTasks = tasks.filter(task => task.completed);
    }

    if (currentSection === "overdue") {
        visibleTasks = tasks.filter(task => isOverdue(task));
    }

    if (currentSection === "active") {
        visibleTasks = tasks.filter(task => !task.completed);
    }

    /* Если задач нет */
    if (visibleTasks.length === 0) {
        list.innerHTML = `
            <div class="empty">
                <h3>У вас пока нет задач</h3>
                <p>Нажмите «Добавить задачу», чтобы начать работу.</p>
            </div>
        `;
        updateStatistics();
        return;
    }

    /* Создание списка */
    list.innerHTML = visibleTasks.map(task => {
        const overdue = isOverdue(task);
        const progress = getTaskProgress(task);
        const subtasksHTML = Array.isArray(task.subtasks) && task.subtasks.length
            ? task.subtasks.map(subtask => `
                <label class="subtask-item ${subtask.completed ? "done" : ""}">
                    <input
                        type="checkbox"
                        ${subtask.completed ? "checked" : ""}
                        onchange="toggleSubtask('${task.id}', '${subtask.id}'); event.stopPropagation();"
                    >
                    <span>${escapeHTML(subtask.title)}</span>
                </label>
            `).join("")
            : "";

        return `
        <div class="task ${task.completed ? "completed" : ""} ${overdue ? "overdue" : ""}">
            <button
                type="button"
                class="confirm-button"
                ${task.completed ? "disabled" : ""}
                onclick="confirmTask('${task.id}')"
            >Задача выполнена</button>

            <div class="task-info" onclick="selectTask('${task.id}')">
                <div class="task-name">${escapeHTML(task.title)}</div>
                ${
                    task.description
                    ? `<div class="task-description">${escapeHTML(task.description)}</div>`
                    : ""
                }

                ${progress.total ? `
                    <div class="task-progress-block">
                        <div class="task-progress-bar">
                            <span style="width: ${progress.percent}%"></span>
                        </div>
                        <small>${progress.done}/${progress.total} · ${progress.percent}%</small>
                    </div>
                ` : ""}

                ${subtasksHTML ? `<div class="subtask-list">${subtasksHTML}</div>` : ""}

                <div class="attachment-row">
                    <div class="attachment-title">
                        <strong>Файлы</strong>
                        <span>до 40 МБ</span>
                    </div>
                    <input
                        type="file"
                        id="fileInput-${task.id}"
                        class="attachment-input"
                        onchange="attachFileToTask('${task.id}', event)"
                    >
                    <button
                        type="button"
                        class="attachment-button"
                        onclick="document.getElementById('fileInput-${task.id}').click()"
                    >
                        + Добавить файл
                    </button>
                    ${task.attachments.map(attachment => `
                        <div class="attached-file">
                            <span title="${escapeHTML(attachment.name)}">${escapeHTML(attachment.name)}</span>
                            <small>${formatFileSize(attachment.size)}</small>
                            <button
                                type="button"
                                aria-label="Удалить ${escapeHTML(attachment.name)}"
                                onclick="removeAttachment('${task.id}', '${attachment.id}')"
                            >×</button>
                        </div>
                    `).join("")}
                </div>
            </div>

            <div class="deadline">
                ${overdue ? "⚠️ Просрочено" : formatDate(task.deadline)}
            </div>

            <div class="priority ${task.priority}">
                ${priorityName(task.priority)}
            </div>

            <button class="delete" onclick="deleteTask('${task.id}')">×</button>
        </div>
        `;
    }).join("");

    updateStatistics();
}

/* Статистика */
function updateStatistics() {
    const total = tasks.length;
    const completed = tasks.filter(task => task.completed).length;
    const overdue = tasks.filter(task => isOverdue(task)).length;
    const active = total - completed;
    const progress = total ? Math.round((completed / total) * 100) : 0;
    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    setText("total", total);
    setText("completed", completed);
    setText("completedStat", completed);
    setText("overdue", overdue);
    setText("activeStat", active);
    setText("doneStat", `${progress}%`);
    setText("deadlineStat", overdue);
    setText("progressStat", `${progress}%`);
    renderFriendComparison();
}

function getSavedFriends() {
    try {
        const friends = JSON.parse(localStorage.getItem("deadlineBossFriends") || "[]");
        return Array.isArray(friends) ? friends : [];
    } catch {
        return [];
    }
}

function renderFriendComparison() {
    const list = document.getElementById("friendComparison");
    if (!list) return;

    const ownProgress = tasks.length
        ? Math.round((tasks.filter(task => task.completed).length / tasks.length) * 100)
        : 0;
    const entries = [
        { id: "self", name: profile.name || "Вы", progress: ownProgress, isSelf: true },
        ...getSavedFriends().map(friend => ({
            id: String(friend.id),
            name: String(friend.name || "Друг"),
            progress: Math.min(100, Math.max(0, Number(friend.progress) || 0)),
            isSelf: false
        }))
    ].sort((first, second) => second.progress - first.progress);

    list.replaceChildren();
    entries.forEach(entry => {
        const row = document.createElement("div");
        row.className = "comparison-row";

        const person = document.createElement("div");
        person.className = "comparison-person";
        const name = document.createElement("span");
        name.textContent = entry.name;
        person.append(name);

        if (entry.isSelf) {
            const label = document.createElement("small");
            label.className = "comparison-you";
            label.textContent = "Вы";
            person.append(label);
        }

        const value = document.createElement("strong");
        value.className = "comparison-value";
        value.textContent = `${entry.progress}%`;

        const bar = document.createElement("div");
        bar.className = "comparison-bar";
        const fill = document.createElement("span");
        fill.style.width = `${entry.progress}%`;
        bar.append(fill);

        row.append(person, value);

        if (!entry.isSelf) {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "comparison-remove";
            remove.dataset.friendId = entry.id;
            remove.setAttribute("aria-label", `Удалить друга ${entry.name}`);
            remove.title = "Удалить друга";
            remove.textContent = "×";
            row.append(remove);
        }

        row.append(bar);
        list.append(row);
    });
}

function addFriend(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.elements.name.value.trim();
    const progress = Number(form.elements.progress.value);
    const status = document.getElementById("friendStatus");

    if (!name) return;
    if (getSavedFriends().some(friend => String(friend.name).toLowerCase() === name.toLowerCase())) {
        status.textContent = "Этот друг уже добавлен.";
        return;
    }

    const friends = getSavedFriends();
    friends.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name,
        progress: Math.min(100, Math.max(0, progress))
    });
    localStorage.setItem("deadlineBossFriends", JSON.stringify(friends));
    form.reset();
    status.textContent = "Друг добавлен.";
    renderFriendComparison();
}

function removeFriend(event) {
    const button = event.target.closest("button[data-friend-id]");
    if (!button) return;

    const friends = getSavedFriends().filter(friend => String(friend.id) !== button.dataset.friendId);
    localStorage.setItem("deadlineBossFriends", JSON.stringify(friends));
    renderFriendComparison();
}

/* Выбор задачи */
function selectTask(id) {
    selectedTask = tasks.find(task => task.id === id);
    const timerTask = document.getElementById("timerTask");
    if (selectedTask && timerTask) {
        timerTask.textContent = selectedTask.title;
    }
}

/* Подтверждение задачи */
let pendingConfirmTaskId = null;

function confirmTask(id) {
    const task = tasks.find(task => task.id === id);
    if (!task || task.completed) return;

    ensureConfirmTaskModal();
    pendingConfirmTaskId = id;
    const confirmModal = document.getElementById("confirmTaskModal");
    const taskTitle = document.getElementById("confirmTaskTitle");
    const taskMessage = document.getElementById("confirmTaskMessage");

    if (taskTitle) taskTitle.textContent = task.title;
    if (taskMessage) taskMessage.textContent = `Вы уверены, что хотите отметить «${task.title}» как выполненную?`;
    if (confirmModal) confirmModal.classList.remove("hidden");
}

function closeConfirmTaskModal() {
    pendingConfirmTaskId = null;
    const confirmModal = document.getElementById("confirmTaskModal");
    if (confirmModal) confirmModal.classList.add("hidden");
}

function confirmTaskFromModal() {
    const task = tasks.find(item => item.id === pendingConfirmTaskId);
    if (!task || task.completed) {
        closeConfirmTaskModal();
        return;
    }

    task.completed = true;
    saveTasks();
    closeConfirmTaskModal();
    renderTasks();
}

function ensureConfirmTaskModal() {
    if (document.getElementById("confirmTaskModal")) return;

    document.body.insertAdjacentHTML("beforeend", `
        <div class="modal hidden" id="confirmTaskModal" role="dialog" aria-modal="true" aria-labelledby="confirmTaskTitle">
            <div class="modal-box confirmation-modal-box">
                <h2>Подтвердить выполнение</h2>
                <p class="confirmation-task-title" id="confirmTaskTitle"></p>
                <p id="confirmTaskMessage"></p>
                <div class="modal-buttons">
                    <button class="cancel" type="button" onclick="closeConfirmTaskModal()">Отмена</button>
                    <button class="save" type="button" onclick="confirmTaskFromModal()">Подтвердить выполнение</button>
                </div>
            </div>
        </div>
    `);
}

function toggleSubtask(taskId, subtaskId) {
    const task = tasks.find(task => task.id === taskId);
    if (!task || !Array.isArray(task.subtasks)) return;

    task.subtasks = task.subtasks.map(subtask => {
        if (subtask.id === subtaskId) {
            return { ...subtask, completed: !subtask.completed };
        }

        return subtask;
    });

    saveTasks();
    renderTasks();
}

/* Удаление */
function deleteTask(id) {
    tasks = tasks.filter(task => task.id !== id);
    saveTasks();
    renderTasks();
}

async function attachFileToTask(taskId, event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_SIZE) {
        alert("Файл не может превышать 40 МБ.");
        event.target.value = "";
        return;
    }

    try {
        const record = await saveAttachment(taskId, file);
        const task = tasks.find(item => item.id === taskId);
        if (!task) return;

        task.attachments.push({
            id: record.id,
            name: record.fileName,
            type: record.type,
            size: record.size,
            uploadedAt: record.uploadedAt
        });
        saveTasks();
        renderTasks();
    } catch (error) {
        console.error(error);
        alert("Файл не удалось закрепить. Проверьте доступность хранилища.");
    } finally {
        event.target.value = "";
    }
}

async function removeAttachment(taskId, attachmentId) {
    const task = tasks.find(item => item.id === taskId);
    if (!task) return;

    task.attachments = task.attachments.filter(attachment => attachment.id !== attachmentId);
    await deleteAttachment(attachmentId);
    saveTasks();
    renderTasks();
}

/* Переключение разделов */
function showSection(section, button) {
    currentSection = section;

    if (button) {
        document.querySelectorAll(".sidebar button").forEach(btn => btn.classList.remove("active"));
        button.classList.add("active");
    }

    const titles = {
        all: "Главная",
        active: "Все задачи",
        completed: "Выполненные",
        overdue: "Просроченные"
    };

    document.getElementById("pageTitle").textContent = titles[section];
    renderTasks();
}

/* =========================
   МОДАЛЬНОЕ ОКНО
========================= */

function renderSubtaskInputs(values = []) {
    const list = document.getElementById("subtaskList");
    if (!list) return;

    const inputs = values.length ? values : [""];
    list.innerHTML = inputs.map(value => `
        <div class="subtask-row">
            <input class="subtask-input" value="${escapeHTML(value)}" placeholder="Подзадача">
        </div>
    `).join("");
}

function addSubtaskInput() {
    const list = document.getElementById("subtaskList");
    if (!list) return;

    const row = document.createElement("div");
    row.className = "subtask-row";
    row.innerHTML = '<input class="subtask-input" placeholder="Подзадача">';
    list.appendChild(row);
}

function readSubtasksFromModal() {
    const inputs = [...document.querySelectorAll(".subtask-input")];

    return inputs
        .map((input, index) => {
            const title = input.value.trim();
            if (!title) return null;

            return {
                id: `${Date.now()}-${index}`,
                title,
                completed: false
            };
        })
        .filter(Boolean);
}

function openModal() {
    document.getElementById("modal").classList.remove("hidden");
    renderSubtaskInputs([]);
    document.getElementById("taskTitle").focus();
}

function closeModal() {
    document.getElementById("modal").classList.add("hidden");
    document.getElementById("error").textContent = "";
    document.getElementById("taskTitle").value = "";
    document.getElementById("taskDescription").value = "";
    document.getElementById("taskPriority").value = "medium";
    document.getElementById("taskDeadline").value = "";
    renderSubtaskInputs([]);
}

function addTask() {
    const title = document.getElementById("taskTitle").value.trim();
    const description = document.getElementById("taskDescription").value.trim();
    const priority = document.getElementById("taskPriority").value;
    const deadline = document.getElementById("taskDeadline").value;
    const error = document.getElementById("error");
    const subtasks = readSubtasksFromModal();

    if (!title) {
        error.textContent = "Введите название задачи.";
        return;
    }

    if (!deadline) {
        error.textContent = "Укажите дедлайн.";
        return;
    }

    if (new Date(deadline) <= new Date()) {
        error.textContent = "Дедлайн должен быть в будущем.";
        return;
    }

    const task = {
        id: Date.now().toString(),
        title,
        description,
        priority,
        deadline,
        completed: false,
        subtasks,
        attachments: []
    };

    tasks.push(task);
    saveTasks();
    renderTasks();
    closeModal();
}

/* =========================
   ТАЙМЕР
========================= */

const defaultTimerMinutes = 25;
const storedTimerMinutes = Number(localStorage.getItem("deadlineBossTimerMinutes"));
let timerMinutes = Number.isFinite(storedTimerMinutes)
    && storedTimerMinutes >= 1
    && storedTimerMinutes <= 240
    ? storedTimerMinutes
    : defaultTimerMinutes;
let time = timerMinutes * 60;
let timerInterval = null;

function openTimerSettings() {
    const settings = document.getElementById("timerSettings");
    const input = document.getElementById("timerDuration");

    if (settings) settings.classList.add("is-open");
    if (input) input.focus();
}

function updateTimerButtons() {
    const startBtn = document.querySelector(".start");
    const pauseBtn = document.querySelector(".pause");
    const resetBtn = document.querySelector(".reset");

    if (!startBtn || !pauseBtn || !resetBtn) return;

    startBtn.disabled = !!timerInterval;
    pauseBtn.disabled = !timerInterval;
    resetBtn.disabled = false;

    startBtn.classList.toggle("is-active", !!timerInterval);
    pauseBtn.classList.toggle("is-active", !!timerInterval);
}

function updateTimer() {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = time % 60;

    document.getElementById("timer").textContent =
        String(hours).padStart(2, "0") + ":" +
        String(minutes).padStart(2, "0") + ":" +
        String(seconds).padStart(2, "0");
}

function startTimer() {
    if (!selectedTask) {
        alert("Сначала выберите задачу.");
        return;
    }

    if (timerInterval) return;

    timerInterval = setInterval(() => {
        if (time <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            updateTimerButtons();
            alert("Время рабочей сессии закончилось!");
            return;
        }

        time--;
        updateTimer();
    }, 1000);

    updateTimerButtons();
}

function pauseTimer() {
    if (!timerInterval) return;
    clearInterval(timerInterval);
    timerInterval = null;
    updateTimerButtons();
}

function resetTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    time = timerMinutes * 60;
    updateTimer();
    updateTimerButtons();
}

function applyTimerDuration() {
    const input = document.getElementById("timerDuration");
    const minutes = Number(input.value);

    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
        alert("Укажите количество минут от 1 до 240.");
        return;
    }

    clearInterval(timerInterval);
    timerInterval = null;
    timerMinutes = minutes;
    time = minutes * 60;
    localStorage.setItem("deadlineBossTimerMinutes", String(minutes));
    input.value = String(minutes);
    updateTimer();
    updateTimerButtons();
}

/* =========================
   ДАТА И ПРОФИЛЬ
========================= */

document.getElementById("date").textContent = new Date().toLocaleDateString(
    "ru-RU",
    { day: "numeric", month: "long", year: "numeric" }
);

function saveProfile() {
    const name = document.getElementById("profileName").value.trim() || defaultProfile.name;
    const email = document.getElementById("profileEmail").value.trim() || defaultProfile.email;
    const school = document.getElementById("profileSchool").value.trim() || defaultProfile.school;

    profile = { name, email, school };
    localStorage.setItem("deadlineBossProfile", JSON.stringify(profile));
    closeProfileModal();
    renderProfile();
}

function renderProfile() {
    document.getElementById("profileName").value = profile.name;
    document.getElementById("profileEmail").value = profile.email;
    document.getElementById("profileSchool").value = profile.school;

    document.querySelector(".header-btn").textContent = `👤 ${profile.name}`;
}

function openProfileModal() {
    renderProfile();
    document.getElementById("profileModal").classList.remove("hidden");
}

function closeProfileModal() {
    document.getElementById("profileModal").classList.add("hidden");
}

function showProfile() {
    openProfileModal();
}

function openSupportModal() {
    document.getElementById("supportModal").classList.remove("hidden");
    document.getElementById("supportName").focus();
}

function closeSupportModal() {
    document.getElementById("supportModal").classList.add("hidden");
    document.getElementById("supportError").textContent = "";
    document.getElementById("supportName").value = "";
    document.getElementById("supportEmail").value = "";
    document.getElementById("supportMessage").value = "";
}

function sendSupportMessage() {
    const name = document.getElementById("supportName").value.trim();
    const email = document.getElementById("supportEmail").value.trim();
    const topic = document.getElementById("supportTopic").value;
    const message = document.getElementById("supportMessage").value.trim();
    const error = document.getElementById("supportError");

    if (!name) {
        error.textContent = "Введите имя.";
        return;
    }

    if (!email) {
        error.textContent = "Укажите email для ответа.";
        return;
    }

    if (!message) {
        error.textContent = "Напишите сообщение.";
        return;
    }

    const topicText = {
        bug: "Ошибка в работе",
        design: "Дизайн / интерфейс",
        question: "Вопрос по функционалу",
        other: "Другое"
    }[topic] || "Другое";

    const subject = encodeURIComponent(`Поддержка Deadline Boss: ${topicText}`);
    const body = encodeURIComponent(`Имя: ${name}\nEmail для ответа: ${email}\nТема: ${topicText}\n\nСообщение:\n${message}`);
    window.location.href = `mailto:dastana2020@mail.ru?subject=${subject}&body=${body}`;
}

function getSavedReviews() {
    try {
        const reviews = JSON.parse(localStorage.getItem("deadlineBossReviews") || "[]");
        return Array.isArray(reviews) ? reviews : [];
    } catch {
        return [];
    }
}

function renderReviews() {
    const list = document.getElementById("userReviews");
    if (!list) return;

    list.replaceChildren();
    getSavedReviews().slice().reverse().forEach(review => {
        const rating = Math.min(5, Math.max(1, Number(review.rating) || 1));
        const item = document.createElement("div");
        item.className = "review-item";

        const stars = document.createElement("div");
        stars.className = "review-stars";
        stars.textContent = "★".repeat(rating) + "☆".repeat(5 - rating);

        const message = document.createElement("p");
        message.textContent = review.message;

        const author = document.createElement("span");
        author.textContent = `— ${review.name}`;

        item.append(stars, message, author);
        list.append(item);
    });
}

function submitReview(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.elements.name.value.trim();
    const message = form.elements.message.value.trim();
    const status = document.getElementById("reviewStatus");

    if (!name || !message) {
        status.textContent = "Укажите имя и напишите отзыв.";
        return;
    }

    const reviews = getSavedReviews();
    reviews.push({
        name,
        message,
        rating: Number(form.elements.rating.value),
        createdAt: new Date().toISOString()
    });
    localStorage.setItem("deadlineBossReviews", JSON.stringify(reviews));

    form.reset();
    status.textContent = "Спасибо! Ваш отзыв опубликован.";
    renderReviews();
}

/* =========================
   ЗАПУСК
========================= */

renderProfile();
applyTheme(currentTheme);
openAttachmentDatabase().catch(error => {
    console.error(error);
});
const timerDurationInput = document.getElementById("timerDuration");
if (timerDurationInput) timerDurationInput.value = String(timerMinutes);
const friendForm = document.getElementById("friendForm");
const friendComparison = document.getElementById("friendComparison");
if (friendForm) friendForm.addEventListener("submit", addFriend);
if (friendComparison) friendComparison.addEventListener("click", removeFriend);
renderTasks();
renderReviews();
const reviewForm = document.getElementById("reviewForm");
if (reviewForm) reviewForm.addEventListener("submit", submitReview);
updateTimer();
updateTimerButtons();
ensureDeadlineReminderModal();
showDeadlineReminder();

/* Автоматическое обновление просроченных задач каждые 30 секунд */
setInterval(() => {
    renderTasks();
}, 30000);

/* Проверка напоминаний каждые 60 секунд */
setInterval(() => {
    showDeadlineReminder();
}, 60000);