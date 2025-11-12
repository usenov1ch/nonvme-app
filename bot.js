const TelegramBot = require('node-telegram-bot-api')
const axios = require('axios')

const BOT_TOKEN = '5911256257:AAGnqJG6f71Ye2_ecbSgdjJUeJjHlagAUWA'
const WEB_APP_URL = 'https://a798b5bf6fe7.ngrok-free.app/register'

const bot = new TelegramBot(BOT_TOKEN, { polling: true })

// 1. Настройка нижней меню-кнопки
async function setPersistentWebAppButton() {
  try {
    const res = await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton`,
        {
            menu_button: {
            type: 'web_app',
            text: '🚀 Открыть NoNvme',
            web_app: {
                url: WEB_APP_URL,
            },
            },
        }
        )
        
    console.log('✅ Нижняя кнопка установлена:', res.data)
  } catch (err) {
    console.error('❌ Ошибка установки нижней кнопки:', err.response?.data || err.message)
  }
}

// 2. При /start отправлять inline WebApp кнопку
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id

  // Отправка WebApp кнопки
  await bot.sendMessage(chatId, 'Добро пожаловать в NoNvme 👋', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🚀 Открыть NoNvme',
            web_app: {
              url: WEB_APP_URL,
            },
          },
        ],
      ],
    },
  })
})

// Установить постоянную нижнюю кнопку при запуске
setPersistentWebAppButton()
  