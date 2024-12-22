// index.js
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// Инициализация базы данных
const db = new sqlite3.Database('./gifts.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initDatabase();
    }
});

// Создание таблиц в базе данных
function initDatabase() {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            telegram_id TEXT UNIQUE,
            username TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS gifts (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            gift_type TEXT,
            received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
}

// Инициализация Express
const app = express();
app.use(cors());
app.use(express.json());

// Инициализация бота
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Веб-приложение
const webAppUrl = 'https://your-webapp-url.com'; // Замените на URL вашего веб-приложения

// Обработка команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;

    try {
        // Добавление пользователя в базу данных
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT OR IGNORE INTO users (telegram_id, username) VALUES (?, ?)',
                [chatId.toString(), username],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Создание клавиатуры с кнопкой для открытия веб-приложения
        const keyboard = {
            inline_keyboard: [
                [{
                    text: '🎁 Открыть подарки',
                    web_app: { url: webAppUrl }
                }]
            ]
        };

        // Отправка приветственного сообщения
        await bot.sendMessage(chatId, 
            'Привет! 👋\nЯ бот для получения подарков. Нажми на кнопку ниже, чтобы открыть приложение:', 
            { reply_markup: keyboard }
        );
    } catch (error) {
        console.error('Error in /start command:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
});

// API endpoints
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Получение подарка для пользователя
app.post('/api/gift', async (req, res) => {
    const { telegram_id } = req.body;

    try {
        // Проверка существования пользователя
        const user = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM users WHERE telegram_id = ?',
                [telegram_id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Проверка, получал ли пользователь подарок сегодня
        const today = new Date().toISOString().split('T')[0];
        const existingGift = await new Promise((resolve, reject) => {
            db.get(
                `SELECT id FROM gifts 
                WHERE user_id = ? AND date(received_at) = ?`,
                [user.id, today],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (existingGift) {
            return res.status(400).json({ error: 'Gift already received today' });
        }

        // Генерация случайного подарка
        const gifts = ['Мышка Logitech G Pro', 'Клавиатура Razer', 'Наушники Sony', 'Коврик для мыши'];
        const randomGift = gifts[Math.floor(Math.random() * gifts.length)];

        // Сохранение подарка в базе данных
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO gifts (user_id, gift_type) VALUES (?, ?)',
                [user.id, randomGift],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ gift: randomGift });
    } catch (error) {
        console.error('Error in gift endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Обработка завершения работы
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed');
        }
        process.exit(0);
    });
});