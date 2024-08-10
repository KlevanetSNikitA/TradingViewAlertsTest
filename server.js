const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');
const os = require('os');
const qs = require('querystring');
const readline = require('readline');

const app = express();
const port = 3000;

app.use(bodyParser.json());

let tradingActive = true;

const sendMessageToTelegram = async (message, BOT_TOKEN, CHAT_ID) => {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const data = {
    chat_id: CHAT_ID,
    text: message,
  };

  try {
    await axios.post(url, data);
    console.log('Message sent to Telegram');
  } catch (error) {
    console.error('Error sending message to Telegram:', error);
  }
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Please enter your BOT Token: ', (botToken) => {
  rl.question('Please enter your Chat ID: ', (chatId) => {
    rl.question('Please enter your API Key: ', (apiKey) => {
      rl.question('Please enter your Secret Key: ', (secretKey) => {
        const BOT_TOKEN = botToken;
        const CHAT_ID = chatId;
        const API_KEY = apiKey;
        const SECRET_KEY = secretKey;

        rl.close();

        app.post('/webhook', async (req, res) => {
          if (!tradingActive) {
            const message = 'Trading is currently paused. Order not placed.';
            console.log(message);
            await sendMessageToTelegram(message, BOT_TOKEN, CHAT_ID);
            return res.status(200).send(message);
          }

          const { symbol, side, qty } = req.body;

          console.log('Received webhook:', req.body);

          const timestamp = Date.now();
          const queryString = qs.stringify({
            symbol,
            side: side.toUpperCase(),
            type: 'MARKET',
            quoteOrderQty: qty,
            timestamp,
          });

          const signature = crypto.createHmac('sha256', SECRET_KEY).update(queryString).digest('hex');

          try {
            const response = await axios.post('https://api.binance.com/api/v3/order', queryString + `&signature=${signature}`, {
              headers: {
                'X-MBX-APIKEY': API_KEY,
                'Content-Type': 'application/x-www-form-urlencoded',
              }
            });

            const successMessage = `Order created successfully for ${symbol}: ${JSON.stringify(response.data)}`;
            console.log('Order response:', response.data);
            res.status(200).send('Order placed successfully');

            await sendMessageToTelegram(successMessage, BOT_TOKEN, CHAT_ID);
          } catch (error) {
            const errorMessage = `Error placing order for ${symbol}: ${error.message}`;
            console.error('Error placing order:', error);
            res.status(500).send('Error placing order');

            await sendMessageToTelegram(errorMessage, BOT_TOKEN, CHAT_ID);
          }
        });

        app.post(`/telegram/${BOT_TOKEN}`, async (req, res) => {
          const message = req.body.message;
          if (message && message.chat && message.chat.id.toString() === CHAT_ID && message.text) {
            if (message.text === '/stop') {
              tradingActive = false;
              await sendMessageToTelegram('Trading has been paused.', BOT_TOKEN, CHAT_ID);
            } else if (message.text === '/continue') {
              tradingActive = true;
              await sendMessageToTelegram('Trading has been resumed.', BOT_TOKEN, CHAT_ID);
            }
          }
          res.status(200).send('OK');
        });

        app.listen(port, () => {
          console.log(`Server running on http://localhost:${port}`);
        });
      });
    });
  });
});