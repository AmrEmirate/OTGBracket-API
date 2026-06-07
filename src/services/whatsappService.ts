import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { verifySessionWithPhone } from '../controllers/waAuthController';

let client: Client;

export const initializeWhatsApp = () => {
  console.log('Initializing WhatsApp Web Client...');

  // Using LocalAuth to persist the session so you don't have to scan every time
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', (qr) => {
    console.log('\n======================================================');
    console.log('SCAN QR CODE INI DENGAN WHATSAPP BUSINESS ANDA:');
    console.log('======================================================\n');
    qrcode.generate(qr, { small: true });
    
    // Fallback: Generate a clickable link to an image of the QR Code
    // Very useful if terminal logs mess up the ASCII formatting
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
    console.log('\nJika QR di atas terpotong/rusak, BUKA LINK INI DI BROWSER UNTUK SCAN:');
    console.log(qrUrl);
    console.log('\n======================================================\n');
  });

  client.on('ready', () => {
    console.log('\n======================================================');
    console.log('WHATSAPP BOT READY!');
    console.log(`Bot terhubung dengan nomor: ${client.info.wid.user}`);
    console.log('======================================================\n');
  });

  client.on('message', async (msg) => {
    const text = msg.body.trim();
    // Expected format from frontend: "Login OTGBracket - Code: PB-XXXXXX"
    if (text.startsWith('Login OTGBracket - Code: ')) {
      const parts = text.split('Code: ');
      if (parts.length > 1) {
        const sessionId = parts[1].trim();
        
        // Get the real phone number instead of internal WA IDs
        const contact = await msg.getContact();
        
        // contact.number is the best source. If undefined, fallback to msg.from
        // msg.from can be '628123456789:15@c.us' (multi-device suffix). We split by '@' and then by ':'
        // For LIDs (2042...), the real number is sometimes in msg.author.
        let rawId = msg.author || msg.from;
        let phone = contact.number || rawId.split('@')[0].split(':')[0];

        // Only override with the bot's number if it is EXACTLY a self-chat.
        // DO NOT override if it's just a LID (2042...), because a real user messaging the bot might use a LID.
        if (msg.from === msg.to) {
             console.log(`[WA DEBUG] Detected exact self-chat. User is testing with their own bot number.`);
             phone = client.info.wid.user;
        }

        // If the phone is STILL a LID, unfortunately WA hid their real number. But we won't assign the bot's number to them!
        // Try to get their WhatsApp display name (Pushname)
        const waName = contact.pushname || (msg as any)._data?.notifyName || undefined;

        console.log(`[WA DEBUG] Extracted User Phone: ${phone}, WA Name: ${waName}`);

        const verified = verifySessionWithPhone(sessionId, phone, waName);
        if (verified) {
          console.log(`[WA BOT] Berhasil memverifikasi sesi ${sessionId} untuk nomor ${phone}`);
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
          msg.reply(`✅ Login berhasil! Anda otomatis masuk di browser.\n\n🔗 Atau klik tautan ini untuk kembali ke web: ${frontendUrl}`);
        } else {
          console.log(`[WA BOT] Gagal memverifikasi sesi ${sessionId} (Kadaluarsa/Tidak Ditemukan)`);
          msg.reply('Sesi login tidak ditemukan atau sudah kadaluarsa. Silakan coba lagi dari web.');
        }
      }
    }
  });

  client.on('disconnected', (reason) => {
    console.log('WhatsApp terputus:', reason);
  });

  client.initialize();
};

export const getBotNumber = (): string | null => {
  return client?.info?.wid?.user || null;
};

export const sendMessageToPhone = async (phone: string, message: string): Promise<boolean> => {
  if (!client) return false;
  try {
    // format phone properly (e.g. 62812... -> 62812...@c.us)
    const chatId = `${phone}@c.us`;
    await client.sendMessage(chatId, message);
    return true;
  } catch (error) {
    console.error('Failed to send WA message:', error);
    return false;
  }
};
