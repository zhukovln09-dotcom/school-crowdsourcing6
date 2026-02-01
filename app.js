// app.js - с системой ролей
class CrowdsourcingApp {
    constructor() {
        this.currentIdeaId = null;
        this.currentUser = { role: 'guest' };
        this.apiBaseUrl = window.location.origin;
        console.log('🚀 Приложение инициализировано');
    }

    // Инициализация при загрузке страницы
    async init() {
        await this.checkAuth();
        await this.loadIdeas();
        this.setupEventListeners();
        this.setupGlobalFunctions();
        this.updateUIForRole();
    }

    // Проверить авторизацию
    async checkAuth() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/auth/me`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const userData = await response.json();
                this.currentUser = userData;
                console.log(`👤 Текущий пользователь: ${userData.role}`);
            }
        } catch (error) {
            console.error('❌ Ошибка проверки авторизации:', error);
        }
    }

    // Загрузка всех идей
    async loadIdeas() {
        try {
            console.log('📥 Загружаем идеи...');
            const response = await fetch(`${this.apiBaseUrl}/api/ideas`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`Ошибка сервера: ${response.status}`);
            }
            
            const ideas = await response.json();
            console.log(`✅ Загружено ${ideas.length} идей`);
            this.displayIdeas(ideas);
            
        } catch (error) {
            console.error('❌ Ошибка загрузки идей:', error);
            this.showError('Не удалось загрузить идеи. Проверьте подключение к интернету.');
        }
    }

    // Отображение идей
    displayIdeas(ideas) {
        const container = document.getElementById('ideasContainer');
        
        if (!ideas || ideas.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 20px;"></i>
                    <h3>Пока нет идей</h3>
                    <p>Будьте первым, кто предложит идею для улучшения школы!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = ideas.map(idea => {
            const safeTitle = this.escapeHtml(idea.title || 'Без названия');
            const safeAuthor = this.escapeHtml(idea.author || 'Аноним');
            const safeDescription = this.escapeHtml(idea.description || '');
            
            return `
                <div class="idea-card" data-id="${idea.id}">
                    <div class="idea-header">
                        <h3 class="idea-title">${safeTitle}</h3>
                        <span class="idea-status">${this.getStatusBadge(idea.status)}</span>
                        ${idea.isFeatured ? '<span class="badge badge-featured"><i class="fas fa-star"></i> Избранная</span>' : ''}
                    </div>
                    
                    <p class="idea-author">Автор: ${safeAuthor}</p>
                    
                    <div class="idea-description">${safeDescription}</div>
                    
                    <div class="idea-stats">
                        <span><i class="fas fa-thumbs-up"></i> ${idea.vote_count || 0} голосов</span>
                        <span><i class="fas fa-comments"></i> ${idea.comment_count || 0} комментариев</span>
                        ${idea.reviewedBy ? `<span><i class="fas fa-user-check"></i> Проверено: ${idea.reviewedBy}</span>` : ''}
                    </div>
                    
                    <div class="idea-footer">
                        <div class="vote-section">
                            <button class="vote-btn" data-idea-id="${idea.id}">
                                <i class="fas fa-thumbs-up"></i> Поддержать
                            </button>
                            <span class="vote-count" id="vote-count-${idea.id}">
                                ${idea.vote_count || 0}
                            </span>
                        </div>
                        
                        <div>
                            <button class="comment-btn" data-idea-id="${idea.id}" data-idea-title="${safeTitle}">
                                <i class="fas fa-comments"></i> Обсудить
                                <span class="comment-count">${idea.comment_count || 0}</span>
                            </button>
                            
                            ${this.getModeratorButtons(idea)}
                            ${this.getContentManagerButtons(idea)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        this.attachEventListeners();
    }

    // Кнопки для модератора
    getModeratorButtons(idea) {
        if (this.currentUser.role !== 'moderator' && this.currentUser.role !== 'admin') {
            return '';
        }
        
        return `
            <button class="moderator-btn delete-idea-btn" data-idea-id="${idea.id}" title="Удалить идею">
                <i class="fas fa-trash"></i>
            </button>
        `;
    }

    // Кнопки для контент-менеджера
    getContentManagerButtons(idea) {
        if (this.currentUser.role !== 'content_manager' && this.currentUser.role !== 'admin') {
            return '';
        }
        
        const buttons = [];
        
        if (idea.status === 'pending') {
            buttons.push(`
                <button class="content-btn approve-btn" data-idea-id="${idea.id}" data-action="approved" title="Одобрить">
                    <i class="fas fa-check"></i>
                </button>
                <button class="content-btn reject-btn" data-idea-id="${idea.id}" data-action="rejected" title="Отклонить">
                    <i class="fas fa-times"></i>
                </button>
            `);
        }
        
        if (idea.status === 'approved' || idea.status === 'featured') {
            const featuredText = idea.isFeatured ? 'Убрать из избранного' : 'В избранное';
            const featuredIcon = idea.isFeatured ? 'fa-star-half-alt' : 'fa-star';
            
            buttons.push(`
                <button class="content-btn progress-btn" data-idea-id="${idea.id}" data-action="in_progress" title="В работу">
                    <i class="fas fa-cog"></i>
                </button>
                <button class="content-btn complete-btn" data-idea-id="${idea.id}" data-action="completed" title="Завершено">
                    <i class="fas fa-flag-checkered"></i>
                </button>
                <button class="content-btn featured-btn" data-idea-id="${idea.id}" data-featured="${!idea.isFeatured}" title="${featuredText}">
                    <i class="fas ${featuredIcon}"></i>
                </button>
            `);
        }
        
        return buttons.join('');
    }

    // Настройка обработчиков
    setupEventListeners() {
        // Форма добавления идеи
        const ideaForm = document.getElementById('ideaForm');
        if (ideaForm) {
            ideaForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitIdea();
            });
        }
        
        // Форма комментария
        const commentForm = document.getElementById('commentForm');
        if (commentForm) {
            commentForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitComment();
            });
        }
        
        // Закрытие модального окна
        const closeBtn = document.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('commentModal').style.display = 'none';
            });
        }
        
        // Закрытие по клику вне окна
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('commentModal');
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
        
        // Кнопка входа
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.showLoginModal());
        }
        
        // Кнопка выхода
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
        
        // Кнопка модератора
        const moderatorBtn = document.getElementById('moderatorBtn');
        if (moderatorBtn) {
            moderatorBtn.addEventListener('click', () => this.showModeratorPanel());
        }
        
        // Кнопка контент-менеджера
        const contentBtn = document.getElementById('contentBtn');
        if (contentBtn) {
            contentBtn.addEventListener('click', () => this.showContentManagerPanel());
        }
    }

    // Привязка обработчиков к динамическим элементам
    attachEventListeners() {
        // Кнопки "Поддержать"
        document.querySelectorAll('.vote-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const ideaId = e.currentTarget.getAttribute('data-idea-id');
                if (ideaId) {
                    this.voteForIdea(ideaId, e.currentTarget);
                }
            });
        });
        
        // Кнопки "Обсудить"
        document.querySelectorAll('.comment-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const ideaId = e.currentTarget.getAttribute('data-idea-id');
                const ideaTitle = e.currentTarget.getAttribute('data-idea-title');
                if (ideaId) {
                    this.openComments(ideaId, ideaTitle);
                }
            });
        });
        
        // Кнопки модератора
        document.querySelectorAll('.delete-idea-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const ideaId = e.currentTarget.getAttribute('data-idea-id');
                if (ideaId && confirm('Вы уверены, что хотите удалить эту идею?')) {
                    this.deleteIdea(ideaId);
                }
            });
        });
        
        // Кнопки контент-менеджера
        document.querySelectorAll('.approve-btn, .reject-btn, .progress-btn, .complete-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const ideaId = e.currentTarget.getAttribute('data-idea-id');
                const action = e.currentTarget.getAttribute('data-action');
                if (ideaId && action) {
                    this.updateIdeaStatus(ideaId, action);
                }
            });
        });
        
        document.querySelectorAll('.featured-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const ideaId = e.currentTarget.getAttribute('data-idea-id');
                const featured = e.currentTarget.getAttribute('data-featured') === 'true';
                if (ideaId) {
                    this.toggleFeatured(ideaId, featured, e.currentTarget);
                }
            });
        });
    }

    // Обновить UI в зависимости от роли
    updateUIForRole() {
        const header = document.querySelector('header');
        
        // Добавляем элементы управления в шапку
        if (!document.getElementById('authControls')) {
            const authControls = document.createElement('div');
            authControls.id = 'authControls';
            authControls.style.cssText = `
                position: absolute;
                top: 20px;
                right: 20px;
                display: flex;
                gap: 10px;
                align-items: center;
            `;
            
            authControls.innerHTML = `
                <span id="userRole" style="color: white; font-size: 14px; background: rgba(255,255,255,0.2); padding: 5px 10px; border-radius: 15px;">
                    Гость
                </span>
                <button id="loginBtn" class="btn-small" style="padding: 5px 15px; font-size: 14px;">
                    <i class="fas fa-sign-in-alt"></i> Войти по коду
                </button>
                <button id="logoutBtn" class="btn-small" style="padding: 5px 15px; font-size: 14px; display: none;">
                    <i class="fas fa-sign-out-alt"></i> Выйти
                </button>
                ${this.currentUser.role === 'moderator' || this.currentUser.role === 'admin' ? 
                    '<button id="moderatorBtn" class="btn-small" style="padding: 5px 15px; font-size: 14px; background: #f44336;"><i class="fas fa-shield-alt"></i> Панель модератора</button>' : ''}
                ${this.currentUser.role === 'content_manager' || this.currentUser.role === 'admin' ? 
                    '<button id="contentBtn" class="btn-small" style="padding: 5px 15px; font-size: 14px; background: #4CAF50;"><i class="fas fa-edit"></i> Панель контент-менеджера</button>' : ''}
            `;
            
            if (header) {
                header.style.position = 'relative';
                header.appendChild(authControls);
            }
        }
        
        // Обновляем отображение
        const userRoleElement = document.getElementById('userRole');
        const loginBtn = document.getElementById('loginBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (userRoleElement) {
            const roleNames = {
                'guest': 'Гость',
                'user': 'Пользователь',
                'moderator': 'Модератор',
                'content_manager': 'Контент-менеджер',
                'admin': 'Администратор'
            };
            
            userRoleElement.textContent = roleNames[this.currentUser.role] || 'Гость';
            userRoleElement.style.background = this.getRoleColor(this.currentUser.role);
        }
        
        if (loginBtn) {
            loginBtn.style.display = this.currentUser.role === 'guest' ? 'inline-block' : 'none';
        }
        
        if (logoutBtn) {
            logoutBtn.style.display = this.currentUser.role !== 'guest' ? 'inline-block' : 'none';
        }
    }

    // Цвета для ролей
    getRoleColor(role) {
        const colors = {
            'guest': 'rgba(255,255,255,0.2)',
            'user': 'rgba(76, 175, 80, 0.3)',
            'moderator': 'rgba(244, 67, 54, 0.3)',
            'content_manager': 'rgba(33, 150, 243, 0.3)',
            'admin': 'rgba(156, 39, 176, 0.3)'
        };
        return colors[role] || 'rgba(255,255,255,0.2)';
    }

    // ========== АВТОРИЗАЦИЯ ==========

    // Показать модальное окно входа
    showLoginModal() {
        const modal = document.createElement('div');
        modal.id = 'loginModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        modal.innerHTML = `
            <div style="
                background: white;
                padding: 30px;
                border-radius: 10px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            ">
                <h3 style="color: #4b6cb7; margin-bottom: 20px;">
                    <i class="fas fa-key"></i> Вход по коду
                </h3>
                
                <p style="margin-bottom: 15px; color: #666; font-size: 14px;">
                    Введите специальный код для доступа:
                </p>
                
                <div style="margin-bottom: 20px; font-size: 12px; color: #888;">
                    <strong>Примеры кодов:</strong><br>
                    • MOD2024 - для модератора<br>
                    • CONTENT2024 - для контент-менеджера<br>
                    • ADMIN2024 - для администратора
                </div>
                
                <input type="text" id="loginCode" placeholder="Введите код" 
                       style="width: 100%; padding: 12px; margin-bottom: 20px; border: 2px solid #ddd; border-radius: 5px; font-size: 16px;">
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="cancelLogin" style="
                        padding: 10px 20px;
                        background: #f5f5f5;
                        color: #333;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                    ">
                        Отмена
                    </button>
                    <button id="submitLogin" style="
                        padding: 10px 20px;
                        background: #4b6cb7;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                    ">
                        <i class="fas fa-sign-in-alt"></i> Войти
                    </button>
                </div>
                
                <div id="loginError" style="color: #f44336; margin-top: 15px; display: none;"></div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Обработчики
        document.getElementById('cancelLogin').addEventListener('click', () => {
            modal.remove();
        });
        
        document.getElementById('submitLogin').addEventListener('click', async () => {
            await this.submitLogin();
        });
        
        document.getElementById('loginCode').addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                await this.submitLogin();
            }
        });
    }

    // Отправить код для входа
    async submitLogin() {
        const codeInput = document.getElementById('loginCode');
        const errorElement = document.getElementById('loginError');
        
        if (!codeInput.value.trim()) {
            errorElement.textContent = 'Введите код';
            errorElement.style.display = 'block';
            return;
        }
        
        const submitBtn = document.getElementById('submitLogin');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        submitBtn.disabled = true;
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code: codeInput.value }),
                credentials: 'include'
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // Обновляем пользователя
                this.currentUser = result.user;
                
                // Закрываем модальное окно
                document.getElementById('loginModal').remove();
                
                // Показываем сообщение
                this.showMessage(`Вход выполнен как ${this.currentUser.role}`, 'success');
                
                // Обновляем UI и перезагружаем идеи
                this.updateUIForRole();
                await this.loadIdeas();
                
            } else {
                const errorData = await response.json();
                errorElement.textContent = errorData.error || 'Ошибка входа';
                errorElement.style.display = 'block';
            }
            
        } catch (error) {
            errorElement.textContent = 'Ошибка сети';
            errorElement.style.display = 'block';
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    // Выйти
    async logout() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/auth/logout`, {
                method: 'POST',
                credentials: 'include'
            });
            
            if (response.ok) {
                this.currentUser = { role: 'guest' };
                this.showMessage('Вы вышли из системы', 'info');
                this.updateUIForRole();
                await this.loadIdeas();
            }
        } catch (error) {
            console.error('Ошибка выхода:', error);
        }
    }

    // ========== ФУНКЦИИ МОДЕРАТОРА ==========

    // Панель модератора
    async showModeratorPanel() {
        try {
            // Загружаем все комментарии
            const response = await fetch(`${this.apiBaseUrl}/api/moderator/comments`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                if (response.status === 403) {
                    this.showError('Доступ запрещен');
                    return;
                }
                throw new Error('Ошибка загрузки данных');
            }
            
            const comments = await response.json();
            
            // Создаем модальное окно
            const modal = document.createElement('div');
            modal.id = 'moderatorModal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                    height: 100%;
                background: rgba(0,0,0,0.7);
                z-index: 10000;
                overflow-y: auto;
                padding: 20px;
            `;
            
            modal.innerHTML = `
                <div style="
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    max-width: 1000px;
                    margin: 0 auto;
                    position: relative;
                ">
                    <button id="closeModerator" style="
                        position: absolute;
                        top: 15px;
                        right: 15px;
                        background: none;
                        border: none;
                        font-size: 24px;
                        cursor: pointer;
                        color: #666;
                    ">
                        &times;
                    </button>
                    
                    <h2 style="color: #f44336; margin-bottom: 30px;">
                        <i class="fas fa-shield-alt"></i> Панель модератора
                    </h2>
                    
                    <div style="margin-bottom: 20px;">
                        <h3 style="color: #333; margin-bottom: 15px;">
                            <i class="fas fa-comments"></i> Все комментарии (${comments.length})
                        </h3>
                        
                        <div style="max-height: 500px; overflow-y: auto;">
                            ${comments.length === 0 ? 
                                '<p style="text-align: center; color: #666; padding: 40px;">Нет комментариев</p>' : 
                                comments.map(comment => `
                                    <div style="
                                        background: ${comment.isDeleted ? '#ffeaea' : '#f5f5f5'};
                                        padding: 15px;
                                        margin-bottom: 10px;
                                        border-radius: 5px;
                                        border-left: 4px solid ${comment.isDeleted ? '#f44336' : '#4b6cb7'};
                                    ">
                                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                            <strong style="color: #333;">${this.escapeHtml(comment.author)}</strong>
                                            <small style="color: #666;">${new Date(comment.created_at).toLocaleString('ru-RU')}</small>
                                        </div>
                                        <p style="margin-bottom: 10px;">${this.escapeHtml(comment.text)}</p>
                                        <div style="font-size: 12px; color: #666;">
                                            ID идеи: ${comment.ideaId}
                                            ${comment.isDeleted ? 
                                                `<br>Удален: ${comment.deletedBy} (${new Date(comment.deletedAt).toLocaleString('ru-RU')})` : 
                                                `<button onclick="window.app.deleteComment('${comment.id}')" style="
                                                    margin-left: 10px;
                                                    padding: 3px 8px;
                                                    background: #f44336;
                                                    color: white;
                                                    border: none;
                                                    border-radius: 3px;
                                                    cursor: pointer;
                                                    font-size: 12px;
                                                ">
                                                    <i class="fas fa-trash"></i> Удалить
                                                </button>`
                                            }
                                        </div>
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>
                    
                    <div style="background: #f5f5f5; padding: 20px; border-radius: 5px; margin-top: 30px;">
                        <h4 style="color: #333; margin-bottom: 15px;">
                            <i class="fas fa-info-circle"></i> Инструкция для модератора:
                        </h4>
                        <ul style="color: #666; margin: 0; padding-left: 20px;">
                            <li>Удаляйте нежелательные или оскорбительные комментарии</li>
                            <li>Для удаления идеи используйте кнопку 🗑️ на карточке идеи</li>
                            <li>Удаленные элементы можно восстановить через базу данных</li>
                        </ul>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Обработчики
            document.getElementById('closeModerator').addEventListener('click', () => {
                modal.remove();
            });
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            });
            
        } catch (error) {
            console.error('Ошибка загрузки панели модератора:', error);
            this.showError('Не удалось загрузить панель модератора');
        }
    }

    // Удалить идею
    async deleteIdea(ideaId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/moderator/ideas/${ideaId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            if (response.ok) {
                this.showMessage('Идея удалена', 'success');
                await this.loadIdeas();
            } else {
                const errorData = await response.json();
                this.showError(errorData.error || 'Ошибка удаления');
            }
        } catch (error) {
            this.showError('Ошибка сети');
        }
    }

    // Удалить комментарий
    async deleteComment(commentId) {
        if (!confirm('Удалить этот комментарий?')) return;
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/moderator/comments/${commentId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            if (response.ok) {
                this.showMessage('Комментарий удален', 'success');
                // Обновляем панель модератора
                document.getElementById('moderatorModal')?.remove();
                await this.showModeratorPanel();
            } else {
                const errorData = await response.json();
                this.showError(errorData.error || 'Ошибка удаления');
            }
        } catch (error) {
            this.showError('Ошибка сети');
        }
    }

    // ========== ФУНКЦИИ КОНТЕНТ-МЕНЕДЖЕРА ==========

    // Панель контент-менеджера
    async showContentManagerPanel() {
        try {
            // Загружаем идеи на рассмотрении
            const response = await fetch(`${this.apiBaseUrl}/api/content/ideas/pending`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                if (response.status === 403) {
                    this.showError('Доступ запрещен');
                    return;
                }
                throw new Error('Ошибка загрузки данных');
            }
            
            const pendingIdeas = await response.json();
            
            // Создаем модальное окно
            const modal = document.createElement('div');
            modal.id = 'contentManagerModal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.7);
                z-index: 10000;
                overflow-y: auto;
                padding: 20px;
            `;
            
            modal.innerHTML = `
                <div style="
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    max-width: 1000px;
                    margin: 0 auto;
                    position: relative;
                ">
                    <button id="closeContentManager" style="
                        position: absolute;
                        top: 15px;
                        right: 15px;
                        background: none;
                        border: none;
                        font-size: 24px;
                        cursor: pointer;
                        color: #666;
                    ">
                        &times;
                    </button>
                    
                    <h2 style="color: #4CAF50; margin-bottom: 30px;">
                        <i class="fas fa-edit"></i> Панель контент-менеджера
                    </h2>
                    
                    <div style="margin-bottom: 30px;">
                        <h3 style="color: #333; margin-bottom: 15px;">
                            <i class="fas fa-clock"></i> Идеи на рассмотрении (${pendingIdeas.length})
                        </h3>
                        
                        ${pendingIdeas.length === 0 ? 
                            '<p style="text-align: center; color: #666; padding: 20px;">Нет идей на рассмотрении</p>' : 
                            pendingIdeas.map(idea => `
                                <div style="
                                    background: #fff9e6;
                                    padding: 20px;
                                    margin-bottom: 15px;
                                    border-radius: 5px;
                                    border-left: 4px solid #ff9800;
                                ">
                                    <h4 style="color: #333; margin-bottom: 10px;">${this.escapeHtml(idea.title)}</h4>
                                    <p style="color: #666; margin-bottom: 10px;">${this.escapeHtml(idea.description)}</p>
                                    <div style="font-size: 14px; color: #888; margin-bottom: 15px;">
                                        Автор: ${this.escapeHtml(idea.author)} | 
                                        Голосов: ${idea.votes} | 
                                        Дата: ${new Date(idea.created_at).toLocaleString('ru-RU')}
                                    </div>
                                    <div style="display: flex; gap: 10px;">
                                        <button onclick="window.app.approveIdea('${idea.id}')" style="
                                            padding: 8px 16px;
                                            background: #4CAF50;
                                            color: white;
                                            border: none;
                                            border-radius: 3px;
                                            cursor: pointer;
                                            font-size: 14px;
                                        ">
                                            <i class="fas fa-check"></i> Одобрить
                                        </button>
                                        <button onclick="window.app.rejectIdea('${idea.id}')" style="
                                            padding: 8px 16px;
                                            background: #f44336;
                                            color: white;
                                            border: none;
                                            border-radius: 3px;
                                            cursor: pointer;
                                            font-size: 14px;
                                        ">
                                            <i class="fas fa-times"></i> Отклонить
                                        </button>
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                    
                    <div style="background: #f5f5f5; padding: 20px; border-radius: 5px;">
                        <h4 style="color: #333; margin-bottom: 15px;">
                            <i class="fas fa-info-circle"></i> Инструкция для контент-менеджера:
                        </h4>
                        <ul style="color: #666; margin: 0; padding-left: 20px;">
                            <li><strong>Одобрить:</strong> Идея становится видимой всем пользователям</li>
                            <li><strong>Отклонить:</strong> Идея скрывается (автор увидит статус "Отклонено")</li>
                            <li><strong>В избранное:</strong> Помечает идею как особо важную (звездочка на карточке)</li>
                            <li><strong>В работу:</strong> Идея принята к реализации</li>
                            <li><strong>Завершено:</strong> Идея реализована</li>
                            <li>Для изменения статуса используйте кнопки на карточках идей</li>
                        </ul>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Обработчики
            document.getElementById('closeContentManager').addEventListener('click', () => {
                modal.remove();
            });
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            });
            
        } catch (error) {
            console.error('Ошибка загрузки панели контент-менеджера:', error);
            this.showError('Не удалось загрузить панель контент-менеджера');
        }
    }

    // Одобрить идею
    async approveIdea(ideaId) {
        await this.updateIdeaStatus(ideaId, 'approved');
        document.getElementById('contentManagerModal')?.remove();
        await this.showContentManagerPanel();
    }

    // Отклонить идею
    async rejectIdea(ideaId) {
        await this.updateIdeaStatus(ideaId, 'rejected');
        document.getElementById('contentManagerModal')?.remove();
        await this.showContentManagerPanel();
    }

    // Обновить статус идеи
    async updateIdeaStatus(ideaId, status) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/content/ideas/${ideaId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status }),
                credentials: 'include'
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showMessage(result.message, 'success');
                await this.loadIdeas();
            } else {
                const errorData = await response.json();
                this.showError(errorData.error || 'Ошибка обновления');
            }
        } catch (error) {
            this.showError('Ошибка сети');
        }
    }

    // Переключить избранное
    async toggleFeatured(ideaId, featured, buttonElement) {
        try {
            const originalHTML = buttonElement.innerHTML;
            buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            
            const response = await fetch(`${this.apiBaseUrl}/api/content/ideas/${ideaId}/featured`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ featured }),
                credentials: 'include'
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showMessage(result.message, 'success');
                await this.loadIdeas();
            } else {
                const errorData = await response.json();
                this.showError(errorData.error || 'Ошибка обновления');
            }
        } catch (error) {
            this.showError('Ошибка сети');
        }
    }

    // ========== ОСНОВНЫЕ ФУНКЦИИ ==========

    // Голосование за идею
    async voteForIdea(ideaId, buttonElement) {
        if (!confirm('Вы уверены, что хотите поддержать эту идею?')) {
            return;
        }
        
        const originalHTML = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Голосую...';
        buttonElement.disabled = true;
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/ideas/${ideaId}/vote`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Ошибка голосования');
            }
            
            const result = await response.json();
            
            if (result.success) {
                this.showMessage('Спасибо за ваш голос! 💙', 'success');
                setTimeout(() => this.loadIdeas(), 1000);
            } else {
                throw new Error(result.error || 'Ошибка голосования');
            }
            
        } catch (error) {
            if (error.message.includes('уже голосовали')) {
                this.showError('Вы уже голосовали за эту идею!');
            } else {
                this.showError(error.message || 'Не удалось проголосовать');
            }
        } finally {
            buttonElement.innerHTML = originalHTML;
            buttonElement.disabled = false;
        }
    }

    // Открытие комментариев
    openComments(ideaId, title) {
        this.currentIdeaId = ideaId;
        
        const modalTitle = document.getElementById('modalTitle');
        if (modalTitle) {
            modalTitle.textContent = `Комментарии: ${title}`;
        }
        
        const commentsContainer = document.getElementById('commentsContainer');
        if (commentsContainer) {
            commentsContainer.innerHTML = `
                <div class="loading">
                    <i class="fas fa-spinner fa-spin"></i> Загрузка комментариев...
                </div>
            `;
        }
        
        const modal = document.getElementById('commentModal');
        if (modal) {
            modal.style.display = 'block';
        }
        
        this.loadAndDisplayComments(ideaId);
        
        setTimeout(() => {
            const authorInput = document.getElementById('commentAuthor');
            if (authorInput) {
                authorInput.focus();
            }
        }, 100);
    }

    // Загрузка комментариев
    async loadAndDisplayComments(ideaId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/ideas/${ideaId}/comments`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`Ошибка сервера: ${response.status}`);
            }
            
            const comments = await response.json();
            this.displayCommentsInModal(comments);
            
        } catch (error) {
            console.error('❌ Ошибка загрузки комментариев:', error);
            
            const container = document.getElementById('commentsContainer');
            if (container) {
                container.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h4>Не удалось загрузить комментарии</h4>
                        <p>${error.message}</p>
                        <button onclick="window.app.loadAndDisplayComments(${ideaId})" class="btn-small">
                            <i class="fas fa-redo"></i> Попробовать снова
                        </button>
                    </div>
                `;
            }
        }
    }

    // Отображение комментариев
    displayCommentsInModal(comments) {
        const container = document.getElementById('commentsContainer');
        if (!container) return;
        
        if (!comments || comments.length === 0) {
            container.innerHTML = `
                <div class="no-comments">
                    <i class="fas fa-comment-slash"></i>
                    <h4>Пока нет комментариев</h4>
                    <p>Будьте первым, кто оставит комментарий!</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = comments.map(comment => `
            <div class="comment">
                <div class="comment-header">
                    <span class="comment-author">
                        <i class="fas fa-user-circle"></i> ${this.escapeHtml(comment.author || 'Аноним')}
                    </span>
                    <span class="comment-date">
                        ${new Date(comment.created_at).toLocaleString('ru-RU')}
                    </span>
                </div>
                <div class="comment-text">${this.escapeHtml(comment.text)}</div>
            </div>
        `).join('');
    }

    // Добавление новой идеи
    async submitIdea() {
        const title = document.getElementById('title').value.trim();
        const description = document.getElementById('description').value.trim();
        const author = document.getElementById('author').value.trim();
        
        if (!title || !description) {
            this.showError('Пожалуйста, заполните все поля');
            return;
        }
        
        if (title.length < 3) {
            this.showError('Название идеи должно быть не менее 3 символов');
            return;
        }
        
        if (description.length < 10) {
            this.showError('Описание должно быть не менее 10 символов');
            return;
        }
        
        const submitBtn = document.querySelector('#ideaForm button[type="submit"]');
        const originalHTML = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Публикую...';
        submitBtn.disabled = true;
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/ideas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title,
                    description,
                    author: author || 'Аноним'
                }),
                credentials: 'include'
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Ошибка сервера');
            }
            
            const result = await response.json();
            
            if (result.success) {
                document.getElementById('ideaForm').reset();
                this.showMessage('🎉 Идея успешно опубликована и отправлена на рассмотрение!', 'success');
                setTimeout(() => this.loadIdeas(), 1000);
            } else {
                throw new Error(result.error || 'Ошибка публикации');
            }
            
        } catch (error) {
            console.error('❌ Ошибка добавления идеи:', error);
            this.showError(error.message || 'Не удалось опубликовать идею');
        } finally {
            submitBtn.innerHTML = originalHTML;
            submitBtn.disabled = false;
        }
    }

    // Добавление комментария
    async submitComment() {
        if (!this.currentIdeaId) {
            this.showError('Не выбрана идея для комментария');
            return;
        }
        
        const author = document.getElementById('commentAuthor').value.trim();
        const text = document.getElementById('commentText').value.trim();
        
        if (!text) {
            this.showError('Пожалуйста, введите текст комментария');
            return;
        }
        
        if (text.length < 2) {
            this.showError('Комментарий должен быть не менее 2 символов');
            return;
        }
        
        const submitBtn = document.querySelector('#commentForm button[type="submit"]');
        const originalHTML = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отправляю...';
        submitBtn.disabled = true;
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/ideas/${this.currentIdeaId}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    author: author || 'Аноним',
                    text
                }),
                credentials: 'include'
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Ошибка сервера');
            }
            
            const result = await response.json();
            
            if (result.success) {
                document.getElementById('commentText').value = '';
                this.showMessage('💬 Комментарий добавлен!', 'success');
                await this.loadAndDisplayComments(this.currentIdeaId);
                setTimeout(() => this.loadIdeas(), 1000);
            } else {
                throw new Error(result.error || 'Ошибка добавления');
            }
            
        } catch (error) {
            console.error('❌ Ошибка добавления комментария:', error);
            this.showError(error.message || 'Не удалось добавить комментарий');
        } finally {
            submitBtn.innerHTML = originalHTML;
            submitBtn.disabled = false;
        }
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

    // Бейджи статусов
    getStatusBadge(status) {
        const badges = {
            'pending': '<span class="badge badge-pending"><i class="fas fa-clock"></i> На рассмотрении</span>',
            'approved': '<span class="badge badge-approved"><i class="fas fa-check"></i> Одобрено</span>',
            'rejected': '<span class="badge badge-rejected"><i class="fas fa-times"></i> Отклонено</span>',
            'in_progress': '<span class="badge badge-in-progress"><i class="fas fa-cog"></i> В работе</span>',
            'completed': '<span class="badge badge-completed"><i class="fas fa-flag-checkered"></i> Реализовано</span>',
            'featured': '<span class="badge badge-featured"><i class="fas fa-star"></i> Избранная</span>'
        };
        
        return badges[status] || badges['pending'];
    }

    // Экранирование HTML
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Показать сообщение
    showMessage(text, type = 'info') {
        const existing = document.querySelectorAll('.app-message');
        existing.forEach(msg => msg.remove());
        
        const message = document.createElement('div');
        message.className = `app-message message-${type}`;
        message.innerHTML = `
            <div class="message-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${text}</span>
                <button class="message-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        message.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            animation: slideInRight 0.3s ease;
        `;
        
        document.body.appendChild(message);
        
        if (type !== 'error') {
            setTimeout(() => {
                if (message.parentElement) {
                    message.style.opacity = '0';
                    setTimeout(() => {
                        if (message.parentElement) {
                            message.remove();
                        }
                    }, 300);
                }
            }, 4000);
        }
    }

    // Показать ошибку
    showError(text) {
        this.showMessage(text, 'error');
    }

    // Глобальные функции
    setupGlobalFunctions() {
        window.app = this;
    }
}

// Запуск приложения
let app;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 Документ загружен');
    
    try {
        app = new CrowdsourcingApp();
        window.app = app;
        await app.init();
        console.log('✅ Приложение успешно запущено');
        
    } catch (error) {
        console.error('❌ Фатальная ошибка инициализации:', error);
        
        const container = document.getElementById('ideasContainer');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #f44336;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i>
                    <h3>Ошибка загрузки приложения</h3>
                    <p>${error.message}</p>
                    <button onclick="location.reload()" style="
                        padding: 10px 20px;
                        background: #4b6cb7;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        margin-top: 20px;
                    ">
                        <i class="fas fa-redo"></i> Перезагрузить страницу
                    </button>
                </div>
            `;
        }
    }
});
