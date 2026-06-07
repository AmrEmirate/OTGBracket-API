import app from './app';
import { initializeWhatsApp } from './services/whatsappService';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
  
  // Initialize the WhatsApp Bot
  initializeWhatsApp();
});
