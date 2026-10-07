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
            : []
    };
}

let tasks = JSON.parse(
    localStorage.getItem("deadlineBossTasks") || "[]"
).map(normalizeTask);

let currentSection = "all";
let selectedTask = null;

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
            <input
                type="checkbox"
                ${task.completed ? "checked" : ""}
                onchange="completeTask('${task.id}')"
            >

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

    document.getElementById("total").textContent = total;
    document.getElementById("completed").textContent = completed;
    document.getElementById("overdue").textContent = overdue;
    document.getElementById("activeStat").textContent = active;
    document.getElementById("doneStat").textContent = `${progress}%`;
    document.getElementById("deadlineStat").textContent = overdue;
    document.getElementById("progressStat").textContent = `${progress}%`;
}

/* Выбор задачи */
function selectTask(id) {
    selectedTask = tasks.find(task => task.id === id);
    if (selectedTask) {
        document.getElementById("timerTask").textContent = selectedTask.title;
    }
}

/* Выполнение задачи */
function completeTask(id) {
    const task = tasks.find(task => task.id === id);
    if (task) {
        task.completed = !task.completed;
        saveTasks();
        renderTasks();
    }
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
        subtasks
    };

    tasks.push(task);
    saveTasks();
    renderTasks();
    closeModal();
}

/* =========================
   ТАЙМЕР
========================= */

let time = 25 * 60;
let timerInterval = null;

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
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;

    document.getElementById("timer").textContent =
        String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
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
    time = 25 * 60;
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

    const formatted = `Заявка в поддержку\n\nИмя: ${name}\nEmail: ${email}\nТема: ${topicText}\n\nСообщение:\n${message}`;

    alert(formatted);
    closeSupportModal();
}

/* =========================
   ЗАПУСК
========================= */

renderProfile();
applyTheme(currentTheme);
renderTasks();
updateTimer();

/* Автоматическое обновление просроченных задач каждые 30 секунд */
setInterval(() => {
    renderTasks();
}, 30000);