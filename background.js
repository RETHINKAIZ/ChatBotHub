// Background Service Worker - 后台脚本

// 内置模型列表
const MODELS = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com', color: '#000000' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com', color: '#4285f4' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai', color: '#d97757' },
  { id: 'grok', name: 'Grok', url: 'https://grok.com', color: '#000000' },
  { id: 'kimi', name: 'Kimi', url: 'https://kimi.moonshot.cn', color: '#ffffff' },
  { id: 'zhipu', name: '智谱清言', url: 'https://chatglm.cn', color: '#4c9aff' },
  { id: 'ernie', name: '文心一言', url: 'https://yiyan.baidu.com', color: '#2932e1' },
  { id: 'qwen', name: '通义千问', url: 'https://tongyi.aliyun.com', color: '#615ced' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com', color: '#3b82f6' },
  { id: 'doubao', name: '豆包', url: 'https://doubao.com', color: '#22d3ee' }
];

// 插件安装时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[ChatBotHub] 已安装', details);

  // 初始化侧边栏开关为开启状态
  const state = await chrome.storage.local.get(['sidebar_enabled']);
  if (state.sidebar_enabled === undefined) {
    await chrome.storage.local.set({ sidebar_enabled: true });
    console.log('[ChatBotHub] sidebar_enabled 初始化为 true');
  }

  // 创建上下文菜单
  chrome.contextMenus.create({
    id: 'chatbot-menu',
    title: 'ChatBotHub',
    contexts: ['selection', 'page']
  });

  // 为每个模型创建上下文菜单项
  MODELS.forEach(model => {
    chrome.contextMenus.create({
      id: `open-${model.id}`,
      title: `在 ${model.name} 中打开`,
      parentId: 'chatbot-menu',
      contexts: ['selection', 'page']
    });
  });
});

// 处理上下文菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const selectedText = info.selectionText;

  // 解析菜单 ID
  const match = info.menuId.match(/open-(.+?)$/);
  if (!match) return;

  const modelId = match[1];
  const model = MODELS.find(m => m.id === modelId);

  if (model) {
    // 创建新标签页打开模型
    chrome.tabs.create({
      url: model.url,
      active: true
    });

    // 如果有选中的文本，记录一下
    if (selectedText) {
      console.log('选中的文本:', selectedText);
    }
  }
});

// 监听来自 popup 或 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openModel') {
    // 从内置模型或自定义模型中查找
    const model = MODELS.find(m => m.id === request.modelId);
    if (model) {
      chrome.tabs.create({
        url: model.url,
        active: true
      });
      sendResponse({ success: true });
    } else {
      // 尝试从自定义模型中查找
      chrome.storage.local.get(['chatbot_custom_models'], (result) => {
        const customModels = result.chatbot_custom_models || [];
        const customModel = customModels.find(m => m.id === request.modelId);
        if (customModel) {
          chrome.tabs.create({
            url: customModel.url,
            active: true
          });
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Model not found' });
        }
      });
      return true; // 保持消息通道打开以进行异步响应
    }
  }

  if (request.action === 'getModels') {
    sendResponse({ models: MODELS });
  }

  if (request.action === 'refreshAppBar') {
    // 转发给所有 content script
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.url && !tab.url.startsWith('chrome://')) {
          chrome.tabs.sendMessage(tab.id, request).catch(() => {});
        }
      });
    });
    sendResponse({ success: true });
  }

  return false;
});
