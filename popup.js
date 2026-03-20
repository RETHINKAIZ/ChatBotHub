// Popup 页面逻辑

let currentEditingModel = null;
let uploadedIconBase64 = null;
let draggedModelCard = null;
let draggedGroupSection = null;
let allModelsMap = {};

function isColorDark(hex) {
  if (!hex || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.3;
}

document.addEventListener('DOMContentLoaded', async () => {
  // 初始化
  await loadModels();
  setupEventListeners();
  setupKeyboardShortcuts();
});

/**
 * 加载模型列表
 */
async function loadModels() {
  const container = document.getElementById('modelsContainer');
  const modelsByGroup = await Storage.getModelsByGroup();

  container.innerHTML = '';

  const groups = Object.values(modelsByGroup).sort((a, b) => a.group.order - b.group.order);

  // 缓存所有模型用于编辑
  allModelsMap = {};
  groups.forEach(({ models }) => {
    models.forEach(m => { allModelsMap[m.id] = m; });
  });

  groups.forEach(({ group, models }) => {

    const groupSection = document.createElement('div');
    groupSection.className = 'group-section';
    groupSection.dataset.groupId = group.id;

    const toggleIcon = group.expanded !== false ? '▼' : '▶';

    groupSection.innerHTML = `
      <div class="group-header" data-group-id="${group.id}">
        <div class="group-title">
          <span>${group.name}</span>
          <span style="color: var(--chb-muted); font-weight: 400;">(${models.length})</span>
        </div>
        <div class="group-toggle ${group.expanded === false ? 'collapsed' : ''}">${toggleIcon}</div>
      </div>
      <div class="group-models" style="display: ${group.expanded === false ? 'none' : 'block'}">
        <div class="models-grid">
          ${models.map(model => createModelCard(model)).join('')}
        </div>
      </div>
    `;

    // 分组点击事件
    const groupHeader = groupSection.querySelector('.group-header');
    groupHeader.addEventListener('click', async () => {
      await Storage.toggleGroupExpanded(group.id);
      await loadModels();
    });

    // 分组拖拽排序（仅拖拽分组头部）
    groupHeader.draggable = true;
    groupHeader.addEventListener('dragstart', handleGroupDragStart);
    groupHeader.addEventListener('dragover', handleGroupDragOver);
    groupHeader.addEventListener('dragleave', handleGroupDragLeave);
    groupHeader.addEventListener('drop', handleGroupDrop);
    groupHeader.addEventListener('dragend', handleGroupDragEnd);

    container.appendChild(groupSection);
  });

  if (!container.dataset.bound) {
    container.dataset.bound = 'true';

    container.addEventListener('click', async (e) => {
      const card = e.target.closest('.model-card');
      if (!card) return;
      const modelId = card.dataset.modelId;
      const modelUrl = card.dataset.modelUrl;
      openModel(modelId, modelUrl);
    });

    // 右键菜单
    container.addEventListener('contextmenu', (e) => {
      const card = e.target.closest('.model-card');
      if (!card) return;
      e.preventDefault();
      showModelContextMenu(e.clientX, e.clientY, card.dataset.modelId, card.dataset.isCustom === 'true');
    });

    container.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.model-card');
      if (!card) return;
      handleModelDragStart.call(card, e);
    });

    container.addEventListener('dragend', (e) => {
      const card = e.target.closest('.model-card');
      if (!card) return;
      handleModelDragEnd.call(card, e);
    });

    container.addEventListener('dragover', (e) => {
      const card = e.target.closest('.model-card');
      if (!card) return;
      handleModelDragOver.call(card, e);
    });

    container.addEventListener('dragleave', (e) => {
      const card = e.target.closest('.model-card');
      if (!card) return;
      handleModelDragLeave.call(card, e);
    });

    container.addEventListener('drop', (e) => {
      const card = e.target.closest('.model-card');
      if (!card) return;
      handleModelDrop.call(card, e);
    });
  }

}

/**
 * 创建模型卡片 HTML
 */
function createModelCard(model) {
  const isCustom = model.isCustom || false;
  const darkClass = isColorDark(model.color) ? ' dark-color' : '';
  const iconHtml = model.icon
    ? `<img src="${model.icon}" alt="${model.name}" />`
    : `<span class="model-initial${darkClass}" style="color: ${model.color}; font-weight: 700">${model.name.charAt(0).toUpperCase()}</span>`;

  return `
    <div class="model-card" data-model-id="${model.id}" data-model-url="${model.url}" data-is-custom="${isCustom}" draggable="true">
      <div class="model-card-left">
        <div class="model-card-avatar" style="background: ${model.color}0D">
          ${iconHtml}
        </div>
        <div class="model-card-info">
          <div class="model-card-name">${model.name}</div>
          ${model.description ? `<div class="model-card-desc">${model.description}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * 打开模型
 */
async function openModel(modelId, url) {
  // 保存模型状态
  await Storage.saveModelState(modelId, { lastUsed: Date.now() });

  // 在新标签页打开模型
  chrome.tabs.create({
    url: url,
    active: true
  });
}

/**
 * 设置事件监听
 */
function setupEventListeners() {
  // 主题切换按钮
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIconSun = document.getElementById('themeIconSun');
  const themeIconMoon = document.getElementById('themeIconMoon');

  if (themeToggleBtn) {
    // 初始化主题状态
    chrome.storage.local.get(['theme_mode'], (result) => {
      const themeMode = result.theme_mode || 'auto'; // 'auto', 'light', 'dark'
      applyTheme(themeMode);
      updateThemeIcon(themeMode);
    });

    themeToggleBtn.addEventListener('click', async () => {
      const result = await chrome.storage.local.get(['theme_mode']);
      const currentMode = result.theme_mode || 'auto';

      // 判断当前实际显示的主题
      let currentEffective;
      if (currentMode === 'auto') {
        currentEffective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else {
        currentEffective = currentMode;
      }

      // 切换到相反主题
      const newMode = currentEffective === 'dark' ? 'light' : 'dark';

      await chrome.storage.local.set({ theme_mode: newMode });
      applyTheme(newMode);
      updateThemeIcon(newMode);

      // 通知所有标签页侧边栏同步主题
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab => {
        if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          chrome.tabs.sendMessage(tab.id, { action: 'refreshAppBar' }).catch(() => {});
        }
      });

      const modeNames = { light: '浅色模式', dark: '深色模式' };
      showToast(modeNames[newMode]);
    });
  }

  function applyTheme(themeMode) {
    const html = document.documentElement;

    if (themeMode === 'auto') {
      html.removeAttribute('data-theme');
      html.style.colorScheme = 'normal';
      return;
    }

    html.setAttribute('data-theme', themeMode);
    html.style.colorScheme = themeMode === 'light' ? 'light' : 'dark';
  }

  function updateThemeIcon(themeMode) {
    if (!themeIconSun || !themeIconMoon) return;

    if (themeMode === 'light') {
      themeIconSun.style.display = 'block';
      themeIconMoon.style.display = 'none';
      return;
    }

    if (themeMode === 'dark') {
      themeIconSun.style.display = 'none';
      themeIconMoon.style.display = 'block';
      return;
    }

    // auto 模式下根据系统主题显示
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    themeIconSun.style.display = isDark ? 'none' : 'block';
    themeIconMoon.style.display = isDark ? 'block' : 'none';
  }

  // auto 模式下监听系统主题变化，实时更新 icon
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener?.('change', async () => {
    const result = await chrome.storage.local.get(['theme_mode']);
    const mode = result.theme_mode || 'auto';
    if (mode === 'auto') {
      updateThemeIcon('auto');
    }
  });

  // 侧边栏开关
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  if (sidebarToggleBtn) {
    const applySidebarToggleState = (enabled) => {
      sidebarToggleBtn.classList.toggle('is-active', enabled);
      sidebarToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    };

    // 初始化开关状态
    chrome.storage.local.get(['sidebar_enabled'], (result) => {
      applySidebarToggleState(result.sidebar_enabled === true);
    });

    // 点击切换开关
    sidebarToggleBtn.addEventListener('click', async () => {
      const result = await chrome.storage.local.get(['sidebar_enabled']);
      const enabled = !(result.sidebar_enabled === true);
      await chrome.storage.local.set({ sidebar_enabled: enabled });
      applySidebarToggleState(enabled);
      console.log('[ChatBotHub] 侧边栏开关已更改:', enabled);

      // 通知所有标签页刷新应用栏
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab => {
        if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          chrome.tabs.sendMessage(tab.id, { action: 'refreshAppBar' }).catch(() => {});
        }
      });

      showToast(enabled ? '侧边栏已开启' : '侧边栏已关闭');
    });
  }

  // 添加模型按钮
  document.getElementById('addModelBtn').addEventListener('click', openAddModelModal);
  document.getElementById('closeAddModal').addEventListener('click', closeAddModelModal);
  document.getElementById('cancelAddBtn').addEventListener('click', closeAddModelModal);
  document.getElementById('saveModelBtn').addEventListener('click', saveModel);

  // 管理分组按钮
  document.getElementById('manageGroupsBtn').addEventListener('click', openGroupsModal);
  document.getElementById('closeGroupsModal').addEventListener('click', closeGroupsModal);
  document.getElementById('addGroupBtn').addEventListener('click', addGroup);

  // 搜索
  document.getElementById('searchInput').addEventListener('input', handleSearch);

  // 图标上传
  document.getElementById('modelIcon').addEventListener('change', handleIconUpload);
  document.getElementById('removeIcon').addEventListener('click', removeIcon);

  // 颜色选择
  document.getElementById('modelColor').addEventListener('input', (e) => {
    document.querySelector('.color-value').textContent = e.target.value;
  });
}

/**
 * 键盘快捷键
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + K 聚焦搜索框
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('searchInput').focus();
    }

    // Escape 关闭弹窗
    if (e.key === 'Escape') {
      closeAddModelModal();
      closeGroupsModal();
    }
  });
}

/**
 * 添加模型弹窗
 */
async function openAddModelModal(model = null) {
  currentEditingModel = model;
  const modal = document.getElementById('addModelModal');
  const form = document.getElementById('addModelForm');

  // 动态加载分组选项
  const groups = await Storage.getGroups();
  const groupSelect = document.getElementById('modelGroup');
  groupSelect.innerHTML = groups.map(g =>
    `<option value="${g.id}">${g.icon} ${g.name}</option>`
  ).join('');

  if (model) {
    document.querySelector('.modal-header h2').textContent = '编辑模型';
    document.getElementById('modelName').value = model.name || '';
    document.getElementById('modelUrl').value = model.url || '';
    document.getElementById('modelDescription').value = model.description || '';
    document.getElementById('modelGroup').value = model.groupId || 'default';
    document.getElementById('modelColor').value = model.color || '#3b82f6';
    document.querySelector('.color-value').textContent = model.color || '#3b82f6';

    if (model.icon) {
      showIconPreview(model.icon);
    } else {
      hideIconPreview();
    }
    uploadedIconBase64 = null;
  } else {
    document.querySelector('.modal-header h2').textContent = '添加自定义模型';
    form.reset();
    document.getElementById('modelColor').value = '#3b82f6';
    document.querySelector('.color-value').textContent = '#3b82f6';
    hideIconPreview();
    uploadedIconBase64 = null;
  }

  modal.classList.add('visible');
}

function closeAddModelModal() {
  document.getElementById('addModelModal').classList.remove('visible');
  currentEditingModel = null;
}

/**
 * 右键菜单
 */
function showModelContextMenu(x, y, modelId, isCustom) {
  hideModelContextMenu();
  const menu = document.createElement('div');
  menu.className = 'model-context-menu';
  menu.innerHTML = `
    <div class="context-menu-item" data-action="edit">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
      <span>编辑</span>
    </div>
    <div class="context-menu-item danger" data-action="delete">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
      <span>删除</span>
    </div>
  `;

  // 定位菜单
  document.body.appendChild(menu);
  const rect = document.body.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, rect.width - menuRect.width - 4) + 'px';
  menu.style.top = Math.min(y, rect.height - menuRect.height - 4) + 'px';

  // 菜单点击
  menu.addEventListener('click', async (e) => {
    const item = e.target.closest('.context-menu-item');
    if (!item) return;
    const action = item.dataset.action;
    hideModelContextMenu();

    if (action === 'edit') {
      const model = allModelsMap[modelId];
      if (model) openAddModelModal(model);
    } else if (action === 'delete') {
      if (confirm('确定要删除这个模型吗？')) {
        if (isCustom) {
          await Storage.deleteCustomModel(modelId);
        } else {
          await Storage.hideBuiltInModel(modelId);
        }
        showToast('模型已删除');
        await loadModels();
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
          if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
            chrome.tabs.sendMessage(tab.id, { action: 'refreshAppBar' }).catch(() => {});
          }
        });
      }
    }
  });

  // 点击其他区域关闭
  setTimeout(() => {
    document.addEventListener('click', hideModelContextMenu, { once: true });
  }, 0);
}

function hideModelContextMenu() {
  document.querySelector('.model-context-menu')?.remove();
}

/**
 * 通知侧边栏刷新
 */
function notifySidebarRefresh() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        chrome.tabs.sendMessage(tab.id, { action: 'refreshAppBar' }).catch(() => {});
      }
    });
  });
}

/**
 * 保存模型
 */
async function saveModel() {
  const form = document.getElementById('addModelForm');
  const name = document.getElementById('modelName').value.trim();
  const url = document.getElementById('modelUrl').value.trim();
  const description = document.getElementById('modelDescription').value.trim();
  const groupId = document.getElementById('modelGroup').value;
  const color = document.getElementById('modelColor').value;

  if (!name || !url) {
    showToast('请填写模型名称和链接');
    return;
  }

  // 验证 URL
  try {
    new URL(url);
  } catch (e) {
    showToast('请输入有效的 URL');
    return;
  }

  const modelData = {
    id: currentEditingModel ? currentEditingModel.id : null,
    name,
    url,
    description,
    groupId,
    color,
    icon: uploadedIconBase64
  };

  if (currentEditingModel) {
    modelData.icon = modelData.icon || currentEditingModel.icon;
  }

  await Storage.saveCustomModel(modelData);
  uploadedIconBase64 = null;

  showToast(currentEditingModel ? '模型已更新' : '模型已添加');
  closeAddModelModal();
  await loadModels();
  notifySidebarRefresh();
}

/**
 * 图标上传处理
 */
function handleIconUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  // 检查文件大小（最大 1MB）
  if (file.size > 1024 * 1024) {
    showToast('图标文件大小不能超过 1MB');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    uploadedIconBase64 = event.target.result;
    showIconPreview(event.target.result);
  };
  reader.readAsDataURL(file);
}

function showIconPreview(src) {
  document.getElementById('iconPreview').style.display = 'none';
  const img = document.getElementById('iconPreviewImg');
  img.src = src;
  img.style.display = 'block';
  document.getElementById('removeIcon').style.display = 'flex';
}

function hideIconPreview() {
  document.getElementById('iconPreview').style.display = 'flex';
  document.getElementById('iconPreviewImg').style.display = 'none';
  document.getElementById('removeIcon').style.display = 'none';
}

function removeIcon() {
  uploadedIconBase64 = null;
  document.getElementById('modelIcon').value = '';
  hideIconPreview();
}

/**
 * 分组管理弹窗
 */
async function openGroupsModal() {
  const modal = document.getElementById('manageGroupsModal');
  const groupsList = document.getElementById('groupsList');
  const groups = await Storage.getGroups();

  groupsList.innerHTML = groups.map(group => `
    <div class="group-item" data-group-id="${group.id}">
      <span class="group-item-name">${group.name}</span>
      <div class="group-item-actions">
        ${group.id !== 'default' ? `
          <button class="group-item-btn delete" data-group-id="${group.id}" title="删除分组">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');

  // 绑定删除事件
  groupsList.querySelectorAll('.group-item-btn.delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const groupId = e.currentTarget.dataset.groupId;
      if (confirm('确定要删除这个分组吗？分组下的模型将移至默认分组。')) {
        await Storage.deleteGroup(groupId);
        showToast('分组已删除');
        openGroupsModal(); // 刷新列表
      }
    });
  });

  modal.classList.add('visible');
}

function closeGroupsModal() {
  document.getElementById('manageGroupsModal').classList.remove('visible');
}


/**
 * 添加分组
 */
async function addGroup() {
  const nameInput = document.getElementById('newGroupName');
  const name = nameInput.value.trim();

  if (!name) {
    showToast('请输入分组名称');
    return;
  }

  await Storage.saveGroup({ name, icon: '📁' });
  showToast('分组已添加');

  nameInput.value = '';

  await loadModels(); // 刷新主列表
  openGroupsModal(); // 刷新分组弹窗
}


/**
 * 搜索处理
 */
function handleSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  const cards = document.querySelectorAll('.model-card');
  const groupSections = document.querySelectorAll('.group-section');

  cards.forEach(card => {
    const name = card.querySelector('.model-card-name').textContent.toLowerCase();
    const desc = card.querySelector('.model-card-desc')?.textContent.toLowerCase() || '';
    const match = name.includes(query) || desc.includes(query);
    card.style.display = match ? 'flex' : 'none';
  });

  // 隐藏空的分组
  groupSections.forEach(section => {
    const visibleCards = Array.from(section.querySelectorAll('.model-card')).filter(card => card.style.display !== 'none');
    const hasVisible = visibleCards.length > 0;
    section.style.display = hasVisible || !query ? 'block' : 'none';
  });
}

function handleModelDragStart(e) {
  draggedModelCard = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.modelId || '');
}

function handleModelDragOver(e) {
  e.preventDefault();
  if (!draggedModelCard || draggedModelCard === this) return;
  this.classList.add('drag-over');
}

function handleModelDragLeave() {
  this.classList.remove('drag-over');
}

function handleModelDrop(e) {
  e.preventDefault();
  if (!draggedModelCard || draggedModelCard === this) return;

  const groupModels = this.closest('.group-models')?.querySelector('.models-grid');
  if (!groupModels) return;

  const cards = Array.from(groupModels.querySelectorAll('.model-card'));
  const draggedIndex = cards.indexOf(draggedModelCard);
  const dropIndex = cards.indexOf(this);

  if (draggedIndex < dropIndex) {
    groupModels.insertBefore(draggedModelCard, this.nextSibling);
  } else {
    groupModels.insertBefore(draggedModelCard, this);
  }

  saveModelOrder(groupModels);
}

function handleModelDragEnd() {
  if (draggedModelCard) {
    draggedModelCard.classList.remove('dragging');
  }
  document.querySelectorAll('.model-card.drag-over').forEach(card => card.classList.remove('drag-over'));
  draggedModelCard = null;
}

function saveModelOrder(groupModels) {
  // 保存所有分组中所有模型的全局排序
  const container = document.getElementById('modelsContainer');
  const allCards = Array.from(container.querySelectorAll('.model-card'));
  const items = allCards.map((card, index) => ({
    id: card.dataset.modelId,
    order: index
  }));

  chrome.storage.local.set({ chatbot_model_order_state: items }, () => {
    notifySidebarRefresh();
  });
}

function handleGroupDragStart(e) {
  draggedGroupSection = this.closest('.group-section');
  if (!draggedGroupSection) return;
  draggedGroupSection.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleGroupDragOver(e) {
  e.preventDefault();
  if (!draggedGroupSection) return;
  const targetSection = this.closest('.group-section');
  if (!targetSection || targetSection === draggedGroupSection) return;
  targetSection.classList.add('drag-over');
}

function handleGroupDragLeave() {
  const targetSection = this.closest('.group-section');
  if (targetSection) {
    targetSection.classList.remove('drag-over');
  }
}

function handleGroupDrop(e) {
  e.preventDefault();
  if (!draggedGroupSection) return;

  const targetSection = this.closest('.group-section');
  if (!targetSection || targetSection === draggedGroupSection) return;

  const container = document.getElementById('modelsContainer');
  const sections = Array.from(container.querySelectorAll('.group-section'));
  const draggedIndex = sections.indexOf(draggedGroupSection);
  const dropIndex = sections.indexOf(targetSection);

  if (draggedIndex < dropIndex) {
    container.insertBefore(draggedGroupSection, targetSection.nextSibling);
  } else {
    container.insertBefore(draggedGroupSection, targetSection);
  }

  saveGroupOrder(container);
}

function handleGroupDragEnd() {
  if (draggedGroupSection) {
    draggedGroupSection.classList.remove('dragging');
  }
  document.querySelectorAll('.group-section.drag-over').forEach(section => section.classList.remove('drag-over'));
  draggedGroupSection = null;
}

async function saveGroupOrder(container) {
  const sections = Array.from(container.querySelectorAll('.group-section'));
  const orderMap = sections.map((section, index) => ({
    id: section.dataset.groupId,
    order: index
  }));

  const groups = await Storage.getGroups();
  const updated = groups.map(group => {
    const match = orderMap.find(item => item.id === group.id);
    return match ? { ...group, order: match.order } : group;
  });

  chrome.storage.local.set({ chatbot_groups: updated });
}


function savePopupModelOrder(groupModels) {
  const cards = Array.from(groupModels.querySelectorAll('.model-card'));
  const orderState = cards.map((card, index) => ({
    id: card.dataset.modelId,
    order: index
  }));

  chrome.storage.local.set({ chatbot_model_order_state: orderState });
}

/**
 * Toast 提示
 */
function showToast(message, duration = 2000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('visible');

  setTimeout(() => {
    toast.classList.remove('visible');
  }, duration);
}

