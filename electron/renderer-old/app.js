// app.js

(() => {
    const STORAGE_KEY = "eut_gpt_chats_v1";
    const ACTIVE_CHAT_KEY = "eut_gpt_active_chat_v1";
    const MODEL_KEY = "eut_gpt_selected_model_v1";
    const DEFAULT_GREETING = "Hello! How can I help you today?";

    const sidebar = document.getElementById("chat-history");
    const newChatButton = document.getElementById("new-chat-button");
    const messagesContainer = document.getElementById("messages-container");
    const chatInput = document.getElementById("chat-input");
    const sendButton = document.getElementById("send-button");
    const modelSelect = document.getElementById("model");

    if (!sidebar || !newChatButton || !messagesContainer || !chatInput || !sendButton) {
        console.error("EUT-GPT: Missing required DOM elements.");
        return;
    }

    let chats = loadChats();
    let activeChatId = localStorage.getItem(ACTIVE_CHAT_KEY);
    let isResponding = false;

    if (!Array.isArray(chats) || chats.length === 0) {
        const firstChat = createChat("Chat 1");
        chats = [firstChat];
        activeChatId = firstChat.id;
        saveChats();
    }

    if (!activeChatId || !chats.some(chat => chat.id === activeChatId)) {
        activeChatId = chats[0].id;
    }

    if (modelSelect) {
        const savedModel = localStorage.getItem(MODEL_KEY);
        if (savedModel) {
            modelSelect.value = savedModel;
        }

        modelSelect.addEventListener("change", () => {
            localStorage.setItem(MODEL_KEY, modelSelect.value);

            const chat = getActiveChat();
            if (chat) {
                chat.model = modelSelect.value;
                saveChats();
            }
        });
    }

    function createChat(title = "New Chat") {
        return {
            id: crypto.randomUUID(),
            title,
            createdAt: Date.now(),
            model: modelSelect ? modelSelect.value : "",
            messages: [
                {
                    role: "assistant",
                    content: DEFAULT_GREETING,
                    time: Date.now()
                }
            ]
        };
    }

    function loadChats() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.error("Failed to load chats:", err);
            return [];
        }
    }

    function saveChats() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
        localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
    }

    function getActiveChat() {
        return chats.find(chat => chat.id === activeChatId) || null;
    }

    function isChatEmpty(chat) {
        if (!chat || !Array.isArray(chat.messages)) return true;

        const userMessages = chat.messages.filter(m => m.role === "user");
        const assistantMessages = chat.messages.filter(m => m.role === "assistant");

        if (userMessages.length > 0) {
            return false;
        }

        if (assistantMessages.length === 0) {
            return true;
        }

        if (
            assistantMessages.length === 1 &&
            assistantMessages[0].content === DEFAULT_GREETING
        ) {
            return true;
        }

        return assistantMessages.length === 0;
    }

    function setActiveChat(chatId) {
        activeChatId = chatId;

        const chat = getActiveChat();
        if (chat && modelSelect) {
            modelSelect.value = chat.model || "";
            localStorage.setItem(MODEL_KEY, modelSelect.value);
        }

        saveChats();
        renderSidebar();
        renderMessages();
    }

    function renderSidebar() {
        sidebar.innerHTML = "";

        chats
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .forEach(chat => {
                const btn = document.createElement("button");
                btn.className = "history-item" + (chat.id === activeChatId ? " active" : "");
                btn.textContent = chat.title || "Untitled Chat";
                btn.title = chat.title || "Untitled Chat";

                btn.addEventListener("click", () => {
                    setActiveChat(chat.id);
                });

                sidebar.appendChild(btn);
            });
    }

    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function createMessageElement(message) {
        const div = document.createElement("div");
        div.className = message.role === "user" ? "message user-message" : "message ai-message";
        div.textContent = message.content;

        return div;
    }

    function renderMessages() {
        const chat = getActiveChat();
        messagesContainer.innerHTML = "";

        if (!chat) return;

        chat.messages.forEach(message => {
            messagesContainer.appendChild(createMessageElement(message));
        });

        scrollToBottom();
    }

    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function updateChatTitleFromMessage(chat, text) {
        if (!chat || !text) return;

        const trimmed = text.trim();
        if (!trimmed) return;

        if (chat.title && chat.title !== "New Chat" && chat.title !== "Chat 1") {
            return;
        }

        chat.title = trimmed.length > 24 ? trimmed.slice(0, 24) + "..." : trimmed;
    }

    function setSendingState(sending) {
        isResponding = sending;
        sendButton.disabled = sending;
        chatInput.disabled = sending;

        if (sending) {
            chatInput.placeholder = "Waiting for response...";
            sendButton.textContent = "Generating...";
        } else {
            chatInput.placeholder = "Ask anything about EUT";
            sendButton.textContent = "Send";
        }
    }

    async function sendToBackend(userText, chat) {
        const response = await fetch("http://127.0.0.1:8000/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: userText,
                chat_id: chat.id,
                model: chat.model || modelSelect?.value || ""
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    }

    function addMessageToChat(chatId, role, content) {
        const chat = chats.find(c => c.id === chatId);
        if (!chat) return null;

        const message = {
            role,
            content,
            time: Date.now()
        };

        chat.messages.push(message);

        if (role === "user") {
            updateChatTitleFromMessage(chat, content);
        }

        saveChats();
        renderSidebar();

        if (chat.id === activeChatId) {
            renderMessages();
        }

        return message;
    }

    function getLastUserMessage(chat) {
        if (!chat || !Array.isArray(chat.messages)) return null;

        for (let i = chat.messages.length - 1; i >= 0; i--) {
            if (chat.messages[i].role === "user") {
                return chat.messages[i];
            }
        }

        return null;
    }

    async function handleSend() {
        if (isResponding) return;

        const text = chatInput.value.trim();
        if (!text) return;

        const chat = getActiveChat();
        if (!chat) return;

        addMessageToChat(chat.id, "user", text);

        chatInput.value = "";
        setSendingState(true);

        const targetChatId = chat.id;

        try {
            const data = await sendToBackend(text, chat);

            const reply =
                typeof data === "string"
                    ? data
                    : data.response || data.message || "No response returned.";

            addMessageToChat(targetChatId, "assistant", reply);
        } catch (err) {
            console.error("Send failed:", err);

            addMessageToChat(
                targetChatId,
                "assistant",
                "Error: could not reach the FastAPI backend. Make sure it is running on http://127.0.0.1:8000"
            );
        } finally {
            setSendingState(false);
            if (document.activeElement !== chatInput) {
                chatInput.focus();
            }
        }
    }

    function startNewChat() {
        const current = getActiveChat();

        if (current && isChatEmpty(current)) {
            return;
        }

        const newChat = createChat(`Chat ${chats.length + 1}`);
        chats.unshift(newChat);
        activeChatId = newChat.id;

        saveChats();
        renderSidebar();
        renderMessages();

        chatInput.value = "";
        chatInput.focus();
    }

    function deleteChat(chatId) {
        const index = chats.findIndex(chat => chat.id === chatId);
        if (index === -1) return;

        chats.splice(index, 1);

        if (chats.length === 0) {
            const fallback = createChat("Chat 1");
            chats.push(fallback);
            activeChatId = fallback.id;
        } else if (activeChatId === chatId) {
            activeChatId = chats[0].id;
        }

        saveChats();
        renderSidebar();
        renderMessages();
    }

    function clearCurrentChat() {
        const chat = getActiveChat();
        if (!chat) return;

        chat.messages = [
            {
                role: "assistant",
                content: DEFAULT_GREETING,
                time: Date.now()
            }
        ];

        chat.title = "New Chat";

        saveChats();
        renderSidebar();
        renderMessages();
    }

    newChatButton.addEventListener("click", startNewChat);
    sendButton.addEventListener("click", handleSend);

    chatInput.addEventListener("keydown", (e) => {
        if (isResponding) {
            e.preventDefault();
            return;
        }

        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    const MIN_HEIGHT = 40;
const MAX_HEIGHT = 220;

chatInput.addEventListener("input", () => {
    chatInput.style.height = "auto";

    const newHeight = Math.min(
        chatInput.scrollHeight,
        MAX_HEIGHT
    );

    chatInput.style.height = newHeight + "px";

    chatInput.style.overflowY =
        chatInput.scrollHeight > MAX_HEIGHT
            ? "auto"
            : "hidden";
});

    document.addEventListener("keydown", (e) => {
        if (isResponding) return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
            e.preventDefault();
            startNewChat();
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
            e.preventDefault();
            clearCurrentChat();
        }
    });

    renderSidebar();
    renderMessages();

    window.EUTGPT = {
        get chats() {
            return chats;
        },
        getActiveChat,
        startNewChat,
        clearCurrentChat,
        deleteChat,
        setActiveChat,
        isChatEmpty
    };
})();