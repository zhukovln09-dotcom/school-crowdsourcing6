// database-mongo.js - для MongoDB Atlas с ролями
const mongoose = require('mongoose');

// Строка подключения к MongoDB Atlas
const MONGODB_URI = process.env.MONGODB_URI || 
    'mongodb+srv://Leonid:yzF-UgN-teN-TQ8@cluster0.52cmiku.mongodb.net/?appName=Cluster0&serverSelectionTimeoutMS=5000&socketTimeoutMS=45000';

// Подключение к MongoDB
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ Успешно подключено к MongoDB Atlas');
}).catch((error) => {
    console.error('❌ Ошибка подключения к MongoDB:', error.message);
});

// Схема для пользователей
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        default: 'Гость'
    },
    role: {
        type: String,
        enum: ['guest', 'user', 'moderator', 'content_manager', 'admin'],
        default: 'guest'
    },
    sessionToken: {
        type: String,
        unique: true
    },
    ipAddress: String,
    userAgent: String,
    lastActivity: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Схема для пригласительных кодов
const invitationCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true
    },
    role: {
        type: String,
        enum: ['moderator', 'content_manager', 'admin'],
        required: true
    },
    createdBy: {
        type: String,
        default: 'system'
    },
    usedBy: {
        type: String
    },
    usedAt: Date,
    maxUses: {
        type: Number,
        default: 1
    },
    useCount: {
        type: Number,
        default: 0
    },
    expiresAt: Date,
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Схема для Идей
const ideaSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Название идеи обязательно'],
        minlength: [3, 'Название должно быть минимум 3 символа']
    },
    description: {
        type: String,
        required: [true, 'Описание идеи обязательно'],
        minlength: [10, 'Описание должно быть минимум 10 символов']
    },
    author: {
        type: String,
        required: [true, 'Автор обязателен'],
        default: 'Аноним'
    },
    authorId: String,
    votes: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'in_progress', 'completed', 'featured'],
        default: 'pending'
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    reviewedBy: String,
    reviewedAt: Date,
    reviewNotes: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Схема для Комментариев
const commentSchema = new mongoose.Schema({
    ideaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Idea',
        required: true
    },
    author: {
        type: String,
        required: true,
        default: 'Аноним'
    },
    authorId: String,
    text: {
        type: String,
        required: [true, 'Текст комментария обязателен'],
        minlength: [2, 'Комментарий должен быть минимум 2 символа']
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedBy: String,
    deletedAt: Date,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Схема для Голосов
const voteSchema = new mongoose.Schema({
    ideaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Idea',
        required: true
    },
    userIp: {
        type: String,
        required: true
    },
    userId: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Уникальный индекс для голосов
voteSchema.index({ ideaId: 1, userIp: 1 }, { unique: true });

// Создаем модели
const User = mongoose.model('User', userSchema);
const InvitationCode = mongoose.model('InvitationCode', invitationCodeSchema);
const Idea = mongoose.model('Idea', ideaSchema);
const Comment = mongoose.model('Comment', commentSchema);
const Vote = mongoose.model('Vote', voteSchema);

class Database {
    constructor() {
        console.log('📊 Инициализация MongoDB базы данных с ролями...');
        this.User = User;
        this.InvitationCode = InvitationCode;
        this.Idea = Idea;
        this.Comment = Comment;
        this.Vote = Vote;
        
        // Инициализация кодов при запуске
        this.initInvitationCodes();
    }

    // Инициализация пригласительных кодов
    async initInvitationCodes() {
        try {
            const codes = [
                { code: 'MOD2024', role: 'moderator' },
                { code: 'CONTENT2024', role: 'content_manager' },
                { code: 'ADMIN2024', role: 'admin' }
            ];

            for (const codeData of codes) {
                const exists = await InvitationCode.findOne({ code: codeData.code });
                if (!exists) {
                    await new InvitationCode({
                        code: codeData.code,
                        role: codeData.role,
                        createdBy: 'system',
                        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 год
                    }).save();
                    console.log(`✅ Создан код ${codeData.code} для роли ${codeData.role}`);
                }
            }
        } catch (error) {
            console.error('❌ Ошибка инициализации кодов:', error);
        }
    }

    // ========== ПОЛЬЗОВАТЕЛИ И АВТОРИЗАЦИЯ ==========

    // Создать или получить пользователя
    async createOrGetUser(sessionToken, ipAddress = '', userAgent = '') {
        try {
            let user = await User.findOne({ sessionToken });
            
            if (!user) {
                user = new User({
                    sessionToken,
                    ipAddress,
                    userAgent,
                    role: 'guest'
                });
                await user.save();
            } else {
                user.lastActivity = new Date();
                await user.save();
            }
            
            return user;
        } catch (error) {
            console.error('❌ Ошибка создания/получения пользователя:', error);
            throw error;
        }
    }

    // Авторизация по коду
    async authenticateWithCode(code, sessionToken) {
        try {
            const invitationCode = await InvitationCode.findOne({ 
                code: code.toUpperCase(),
                isActive: true,
                expiresAt: { $gt: new Date() }
            });

            if (!invitationCode) {
                return { success: false, message: 'Неверный или просроченный код' };
            }

            if (invitationCode.useCount >= invitationCode.maxUses) {
                return { success: false, message: 'Код уже использован' };
            }

            // Обновляем пользователя
            const user = await User.findOneAndUpdate(
                { sessionToken },
                { 
                    role: invitationCode.role,
                    lastActivity: new Date()
                },
                { new: true }
            );

            if (!user) {
                return { success: false, message: 'Пользователь не найден' };
            }

            // Обновляем код
            invitationCode.usedBy = sessionToken;
            invitationCode.usedAt = new Date();
            invitationCode.useCount += 1;
            await invitationCode.save();

            return { 
                success: true, 
                user: {
                    role: user.role,
                    username: user.username,
                    sessionToken: user.sessionToken
                }
            };

        } catch (error) {
            console.error('❌ Ошибка авторизации по коду:', error);
            return { success: false, message: 'Ошибка сервера' };
        }
    }

    // Выйти из системы
    async logout(sessionToken) {
        try {
            await User.findOneAndUpdate(
                { sessionToken },
                { role: 'guest' }
            );
            return { success: true };
        } catch (error) {
            console.error('❌ Ошибка выхода:', error);
            return { success: false, message: 'Ошибка сервера' };
        }
    }

    // Получить пользователя по токену
    async getUserByToken(sessionToken) {
        try {
            const user = await User.findOne({ sessionToken });
            return user || { role: 'guest' };
        } catch (error) {
            console.error('❌ Ошибка получения пользователя:', error);
            return { role: 'guest' };
        }
    }

    // ========== ИДЕИ (с функциями для ролей) ==========

    // Получить все идеи с учетом роли
    async getAllIdeas(userRole = 'guest') {
        try {
            let query = {};
            
            // Для обычных пользователей показываем только одобренные идеи
            if (userRole === 'guest' || userRole === 'user') {
                query.status = { $in: ['approved', 'in_progress', 'completed', 'featured'] };
            }
            
            // Для модераторов и контент-менеджеров показываем все кроме удаленных
            if (userRole === 'moderator' || userRole === 'content_manager') {
                query.status = { $nin: ['deleted'] };
            }

            const ideas = await Idea.aggregate([
                { $match: query },
                {
                    $lookup: {
                        from: 'comments',
                        let: { ideaId: '$_id' },
                        pipeline: [
                            { $match: { $expr: { $eq: ['$ideaId', '$$ideaId'] }, isDeleted: false } }
                        ],
                        as: 'comments'
                    }
                },
                {
                    $lookup: {
                        from: 'votes',
                        let: { ideaId: '$_id' },
                        pipeline: [
                            { $match: { $expr: { $eq: ['$ideaId', '$$ideaId'] } } }
                        ],
                        as: 'votes'
                    }
                },
                {
                    $addFields: {
                        comment_count: { $size: '$comments' },
                        vote_count: { $size: '$votes' }
                    }
                },
                {
                    $project: {
                        comments: 0,
                        votes: 0,
                        __v: 0
                    }
                },
                {
                    $sort: {
                        isFeatured: -1,
                        votes: -1,
                        createdAt: -1
                    }
                }
            ]);

            return ideas.map(idea => ({
                id: idea._id,
                title: idea.title,
                description: idea.description,
                author: idea.author,
                authorId: idea.authorId,
                votes: idea.votes,
                status: idea.status,
                isFeatured: idea.isFeatured,
                created_at: idea.createdAt,
                comment_count: idea.comment_count,
                vote_count: idea.vote_count,
                reviewedBy: idea.reviewedBy,
                reviewedAt: idea.reviewedAt
            }));

        } catch (error) {
            console.error('❌ Ошибка получения идей:', error);
            throw error;
        }
    }

    // Добавить новую идею
    async addIdea(title, description, author, authorId = null) {
        try {
            const idea = new Idea({
                title,
                description,
                author: author || 'Аноним',
                authorId,
                status: 'pending' // Новая идея на рассмотрении
            });

            const savedIdea = await idea.save();
            return { success: true, id: savedIdea._id };

        } catch (error) {
            console.error('❌ Ошибка добавления идеи:', error);
            if (error.errors?.title) {
                throw new Error(error.errors.title.message);
            }
            if (error.errors?.description) {
                throw new Error(error.errors.description.message);
            }
            throw new Error('Не удалось добавить идею');
        }
    }

    // ========== ФУНКЦИИ МОДЕРАТОРА ==========

    // Удалить идею (мягкое удаление)
    async deleteIdea(ideaId, moderatorId) {
        try {
            const idea = await Idea.findById(ideaId);
            if (!idea) {
                throw new Error('Идея не найдена');
            }

            idea.status = 'deleted';
            await idea.save();

            // Помечаем все комментарии как удаленные
            await Comment.updateMany(
                { ideaId },
                { 
                    isDeleted: true,
                    deletedBy: moderatorId,
                    deletedAt: new Date()
                }
            );

            return { success: true };

        } catch (error) {
            console.error('❌ Ошибка удаления идеи:', error);
            throw error;
        }
    }

    // Удалить комментарий
    async deleteComment(commentId, moderatorId) {
        try {
            const comment = await Comment.findByIdAndUpdate(
                commentId,
                { 
                    isDeleted: true,
                    deletedBy: moderatorId,
                    deletedAt: new Date()
                },
                { new: true }
            );

            if (!comment) {
                throw new Error('Комментарий не найден');
            }

            return { success: true };

        } catch (error) {
            console.error('❌ Ошибка удаления комментария:', error);
            throw error;
        }
    }

    // Получить все комментарии (включая удаленные для модератора)
    async getAllComments() {
        try {
            const comments = await Comment.find()
                .sort({ createdAt: -1 })
                .lean();
            
            return comments.map(comment => ({
                id: comment._id,
                ideaId: comment.ideaId,
                author: comment.author,
                text: comment.text,
                isDeleted: comment.isDeleted,
                deletedBy: comment.deletedBy,
                deletedAt: comment.deletedAt,
                created_at: comment.createdAt
            }));

        } catch (error) {
            console.error('❌ Ошибка получения комментариев:', error);
            throw error;
        }
    }

    // ========== ФУНКЦИИ КОНТЕНТ-МЕНЕДЖЕРА ==========

    // Изменить статус идеи
    async updateIdeaStatus(ideaId, status, notes = '', userId = '') {
        try {
            const idea = await Idea.findByIdAndUpdate(
                ideaId,
                {
                    status,
                    reviewedBy: userId,
                    reviewedAt: new Date(),
                    reviewNotes: notes
                },
                { new: true }
            );

            if (!idea) {
                throw new Error('Идея не найдена');
            }

            return { success: true, idea };

        } catch (error) {
            console.error('❌ Ошибка обновления статуса:', error);
            throw error;
        }
    }

    // Сделать идею избранной
    async toggleFeatured(ideaId, featured, userId = '') {
        try {
            const idea = await Idea.findByIdAndUpdate(
                ideaId,
                {
                    isFeatured: featured,
                    status: featured ? 'featured' : 'approved',
                    reviewedBy: userId,
                    reviewedAt: new Date()
                },
                { new: true }
            );

            if (!idea) {
                throw new Error('Идея не найдена');
            }

            return { success: true, idea };

        } catch (error) {
            console.error('❌ Ошибка изменения избранного статуса:', error);
            throw error;
        }
    }

    // Получить идеи на рассмотрении
    async getPendingIdeas() {
        try {
            const ideas = await Idea.find({ status: 'pending' })
                .sort({ createdAt: -1 })
                .lean();

            return ideas.map(idea => ({
                id: idea._id,
                title: idea.title,
                description: idea.description,
                author: idea.author,
                votes: idea.votes,
                created_at: idea.createdAt
            }));

        } catch (error) {
            console.error('❌ Ошибка получения идей на рассмотрении:', error);
            throw error;
        }
    }

    // ========== ОБЩИЕ ФУНКЦИИ ==========

    // Проголосовать за идею
    async voteForIdea(ideaId, userIp, userId = null) {
        const session = await mongoose.startSession();
        
        try {
            session.startTransaction();

            const idea = await Idea.findById(ideaId).session(session);
            if (!idea) {
                throw new Error('Идея не найдена');
            }

            try {
                const vote = new Vote({
                    ideaId,
                    userIp,
                    userId
                });
                await vote.save({ session });
            } catch (error) {
                if (error.code === 11000) {
                    throw new Error('Вы уже голосовали за эту идею');
                }
                throw error;
            }

            idea.votes += 1;
            await idea.save({ session });

            await session.commitTransaction();
            return { success: true };

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    // Добавить комментарий
    async addComment(ideaId, author, text, authorId = null) {
        try {
            const idea = await Idea.findById(ideaId);
            if (!idea) {
                throw new Error('Идея не найдена');
            }

            const comment = new Comment({
                ideaId,
                author: author || 'Аноним',
                authorId,
                text
            });

            const savedComment = await comment.save();
            return { success: true, id: savedComment._id };

        } catch (error) {
            console.error('❌ Ошибка добавления комментария:', error);
            if (error.errors?.text) {
                throw new Error(error.errors.text.message);
            }
            throw new Error('Не удалось добавить комментарий');
        }
    }

    // Получить комментарии для идеи
    async getComments(ideaId) {
        try {
            const comments = await Comment.find({ 
                ideaId, 
                isDeleted: false 
            })
                .sort({ createdAt: 1 })
                .lean();
            
            return comments.map(comment => ({
                id: comment._id,
                idea_id: comment.ideaId,
                author: comment.author,
                text: comment.text,
                created_at: comment.createdAt
            }));

        } catch (error) {
            console.error('❌ Ошибка получения комментариев:', error);
            throw error;
        }
    }

    // Получить статистику
    async getStats() {
        try {
            const ideasCount = await Idea.countDocuments({ status: { $ne: 'deleted' } });
            const pendingIdeasCount = await Idea.countDocuments({ status: 'pending' });
            const commentsCount = await Comment.countDocuments({ isDeleted: false });
            const votesCount = await Vote.countDocuments();
            const usersCount = await User.countDocuments({ role: { $ne: 'guest' } });
            
            return {
                ideas: ideasCount,
                pending_ideas: pendingIdeasCount,
                comments: commentsCount,
                votes: votesCount,
                users: usersCount
            };
        } catch (error) {
            console.error('❌ Ошибка получения статистики:', error);
            return { ideas: 0, pending_ideas: 0, comments: 0, votes: 0, users: 0 };
        }
    }

    // Тест подключения
    async testConnection() {
        try {
            await mongoose.connection.db.admin().ping();
            return { connected: true };
        } catch (error) {
            return { connected: false, error: error.message };
        }
    }
}

const database = new Database();
module.exports = database;
