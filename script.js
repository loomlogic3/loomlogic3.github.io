const chatPanel = document.querySelector('[data-chat-panel]');
const chatToggle = document.querySelector('[data-chat-toggle]');
const chatClose = document.querySelector('[data-chat-close]');
const openChatButtons = document.querySelectorAll('[data-open-chat]');
const chatForm = document.querySelector('[data-chat-form]');
const chatTextarea = document.querySelector('#chat-message');
const chatMessages = document.querySelector('[data-chat-messages]');
const starterPrompts = document.querySelectorAll('.starter-prompts button');

const fallbackReply = (message) => {
  const lower = message.toLowerCase();
  if (lower.includes('contact') || lower.includes('email')) {
    return 'You can contact Loom Logic at loomlogic3@gmail.com. You can also follow @oromitayo12 and @loomlogic3 on X.';
  }
  if (lower.includes('v2') || lower.includes('public website')) {
    return 'The public website is Loom Logic’s professional front door for clients. V2 is separate and remains an internal safety-first control plane.';
  }
  if (lower.includes('safety') || lower.includes('control')) {
    return 'Loom Logic’s philosophy is: Add power only after adding control. That means boundaries, approval, logs, and review come before automation.';
  }
  return 'Loom Logic builds professional websites, automation dashboards, client intake systems, product prototypes, Web3 monitoring tools, and launch-ready content workflows. For project inquiries, contact loomlogic3@gmail.com.';
};

const setChatOpen = (open) => {
  chatPanel.hidden = !open;
  chatToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    chatTextarea.focus();
  }
};

const addMessage = (content, role = 'assistant') => {
  const node = document.createElement('div');
  node.className = `chat-message ${role}`;
  node.textContent = content;
  chatMessages.appendChild(node);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return node;
};

const sendMessage = async (message) => {
  const userMessage = message.trim();
  if (!userMessage) return;

  addMessage(userMessage, 'user');
  const pending = addMessage('Thinking...', 'assistant');

  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage }),
    });

    if (!response.ok) {
      throw new Error(`Chat request failed with ${response.status}`);
    }

    const data = await response.json();
    pending.textContent = data.reply || fallbackReply(userMessage);
  } catch {
    pending.textContent = fallbackReply(userMessage);
  }
};

chatToggle.addEventListener('click', () => {
  setChatOpen(chatPanel.hidden);
});

chatClose.addEventListener('click', () => {
  setChatOpen(false);
});

openChatButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setChatOpen(true);
  });
});

starterPrompts.forEach((button) => {
  button.addEventListener('click', () => {
    setChatOpen(true);
    chatTextarea.value = button.textContent;
    sendMessage(button.textContent);
  });
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = chatTextarea.value;
  chatTextarea.value = '';
  sendMessage(message);
});
