// server.js - версия с ролями
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const db = require('./database-mongo.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Генерация токена сессии
const generateSessionToken = () => {
    return 'session_' + Math.random().toString(36).substr(2) + Date.now().toString(36);
};

// Middleware для аутентификации
app.use(async (req, res, next) => {
    try {
        let sessionToken = req.cookies.session_token;
        
        if (!sessionToken) {
            sessionToken = generateSessionToken();
            res.cookie('session_token', sessionToken, { 
                httpOnly: true, 
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
                sameSite: 'lax'
            });
        }
        
        const user = await db.createOrGetUser(
            sessionToken,
            req.ip,
            req.headers['user-agent']
        );
        
        req.user = user;
        req.sessionToken = sessionToken;
        next();
    } catch (error) {
        console.error('Ошибка аутентификации:', error);
        req.user = { role: 'guest' };
        next();
    }
});

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Получить IP пользователя
const getClientIp = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0] || 
           req.ip || 
           req.connection.remoteAddress;
};

// Проверка здоровья API
app.get('/api/health', async (req, res) => {
    try {
        const connectionStatus = await db.testConnection();
        
        res.json({ 
            status: 'healthy',
            database: connectionStatus.connected ? 'connected' : 'disconnected',
            timestamp: new Date().toISOString(),
            mongo: connectionStatus
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'unhealthy',
            error: error.message 
        });
    }
});

// ========== АВТОРИЗАЦИЯ ==========

// Получить текущего пользователя
app.get('/api/auth/me', async (req, res) => {
    try {
        const user = await db.getUserByToken(req.sessionToken);
        res.json({
            role: user.role,
            username: user.username
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Войти по коду
app.post('/api/auth/login', async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'Введите код' });
        }
        
        const result = await db.authenticateWithCode(code, req.sessionToken);
        
        if (result.success) {
            res.json({
                success: true,
                user: result.user
            });
        } else {
            res.status(401).json({ error: result.message });
        }
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Выйти
app.post('/api/auth/logout', async (req, res) => {
    try {
        await db.logout(req.sessionToken);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== ОБЩИЕ API ==========

// Получить статистику
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Получить все идеи (с учетом роли)
app.get('/api/ideas', async (req, res) => {
    try {
        const ideas = await db.getAllIdeas(req.user.role);
        res.json(ideas);
    } catch (error) {
        console.error('Ошибка загрузки идей:', error);
        res.status(500).json({ error: 'Ошибка загрузки идей. Попробуйте позже.' });
    }
});

// Добавить новую идею
app.post('/api/ideas', async (req, res) => {
    try {
        const { title, description, author } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({ 
                error: 'Заполните все поля',
                details: 'Нужны название и описание идеи'
            });
        }
        
        if (title.length < 3) {
            return res.status(400).json({ 
                error: 'Название слишком короткое',
                details: 'Минимум 3 символа'
            });
        }
        
        if (description.length < 10) {
            return res.status(400).json({ 
                error: 'Описание слишком короткое',
                details: 'Минимум 10 символов'
            });
        }
        
        const result = await db.addIdea(
            title, 
            description, 
            author || 'Аноним',
            req.user._id
        );
        
        res.json({ 
            success: true, 
            message: 'Идея успешно добавлена и отправлена на рассмотрение!',
            id: result.id
        });
        
    } catch (error) {
        console.error('Ошибка добавления идеи:', error);
        
        if (error.message.includes('обязательно') || 
            error.message.includes('должно быть')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Не удалось добавить идею' });
        }
    }
});

// Проголосовать за идею
app.post('/api/ideas/:id/vote', async (req, res) => {
    try {
        const ideaId = req.params.id;
        const userIp = getClientIp(req);
        
        if (!ideaId) {
            return res.status(400).json({ error: 'Не указан ID идеи' });
        }
        
        await db.voteForIdea(ideaId, userIp, req.user._id);
        
        res.json({ 
            success: true,
            message: 'Ваш голос учтен!'
        });
        
    } catch (error) {
        console.error('Ошибка голосования:', error);
        
        if (error.message.includes('уже голосовали')) {
            res.status(400).json({ error: error.message });
        } else if (error.message.includes('не найдена')) {
            res.status(404).json({ error: 'Идея не найдена' });
        } else {
            res.status(500).json({ error: 'Ошибка голосования' });
        }
    }
});

// Добавить комментарий
app.post('/api/ideas/:id/comments', async (req, res) => {
    try {
        const ideaId = req.params.id;
        const { author, text } = req.body;
        
        if (!text) {
            return res.status(400).json({ 
                error: 'Введите текст комментария'
            });
        }
        
        if (text.length < 2) {
            return res.status(400).json({ 
                error: 'Комментарий слишком короткий'
            });
        }
        
        const result = await db.addComment(
            ideaId, 
            author || 'Аноним', 
            text,
            req.user._id
        );
        
        res.json({ 
            success: true,
            message: 'Комментарий добавлен!',
            id: result.id
        });
        
    } catch (error) {
        console.error('Ошибка добавления комментария:', error);
        
        if (error.message.includes('не найдена')) {
            res.status(404).json({ error: 'Идея не найдена' });
        } else {
            res.status(500).json({ error: 'Не удалось добавить комментарий' });
        }
    }
});

// Получить комментарии для идеи
app.get('/api/ideas/:id/comments', async (req, res) => {
    try {
        const ideaId = req.params.id;
        const comments = await db.getComments(ideaId);
        
        res.json(comments);
        
    } catch (error) {
        console.error('Ошибка загрузки комментариев:', error);
        res.status(500).json({ error: 'Не удалось загрузить комментарии' });
    }
});

// ========== API МОДЕРАТОРА ==========

// Middleware проверки роли модератора
const requireModerator = async (req, res, next) => {
    if (req.user.role !== 'moderator' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен. Требуется роль модератора.' });
    }
    next();
};

// Middleware проверки роли контент-менеджера
const requireContentManager = async (req, res, next) => {
    if (req.user.role !== 'content_manager' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен. Требуется роль контент-менеджера.' });
    }
    next();
};

// Получить все комментарии (для модератора)
app.get('/api/moderator/comments', requireModerator, async (req, res) => {
    try {
        const comments = await db.getAllComments();
        res.json(comments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Удалить идею
app.delete('/api/moderator/ideas/:id', requireModerator, async (req, res) => {
    try {
        const ideaId = req.params.id;
        await db.deleteIdea(ideaId, req.user._id);
        res.json({ success: true, message: 'Идея удалена' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Удалить комментарий
app.delete('/api/moderator/comments/:id', requireModerator, async (req, res) => {
    try {
        const commentId = req.params.id;
        await db.deleteComment(commentId, req.user._id);
        res.json({ success: true, message: 'Комментарий удален' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== API КОНТЕНТ-МЕНЕДЖЕРА ==========

// Получить идеи на рассмотрении
app.get('/api/content/ideas/pending', requireContentManager, async (req, res) => {
    try {
        const ideas = await db.getPendingIdeas();
        res.json(ideas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Изменить статус идеи
app.put('/api/content/ideas/:id/status', requireContentManager, async (req, res) => {
    try {
        const ideaId = req.params.id;
        const { status, notes } = req.body;
        
        if (!['approved', 'rejected', 'in_progress', 'completed'].includes(status)) {
            return res.status(400).json({ error: 'Недопустимый статус' });
        }
        
        await db.updateIdeaStatus(ideaId, status, notes, req.user._id);
        
        res.json({ 
            success: true, 
            message: `Статус идеи изменен на "${status}"`
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Сделать идею избранной/убрать из избранного
app.put('/api/content/ideas/:id/featured', requireContentManager, async (req, res) => {
    try {
        const ideaId = req.params.id;
        const { featured } = req.body;
        
        await db.toggleFeatured(ideaId, featured, req.user._id);
        
        res.json({ 
            success: true, 
            message: featured ? 'Идея добавлена в избранное' : 'Идея убрана из избранного'
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Обработка 404
app.use((req, res) => {
    res.status(404).json({ error: 'Страница не найдена' });
});

// Обработка ошибок
app.use((error, req, res, next) => {
    console.error('Глобальная ошибка:', error);
    res.status(500).json({ 
        error: 'Внутренняя ошибка сервера',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Сайт: http://localhost:${PORT}`);
    console.log(`📊 MongoDB: ${process.env.MONGODB_URI ? 'Настроен' : 'Используется локальная строка'}`);
    console.log(`🔐 Коды доступа:`);
    console.log(`   Модератор: MOD2024`);
    console.log(`   Контент-менеджер: CONTENT2024`);
    console.log(`   Админ: ADMIN2024`);
});
