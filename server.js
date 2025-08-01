const express = require('express');
const cors = require('cors');
const { ImapFlow } = require('imapflow');
const simpleParser = require('mailparser').simpleParser;

const app = express();
const port = process.env.PORT || 3001;
app.get('/api/test-connection', async (req, res) => {
  res.status(200).json({ message: 'GET method reached successfully' });
});
app.get('/', async (req, res) => {
  res.status(200).json({ message: 'GET method reached successfully' });
});

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to convert SMTP config to IMAP config
const getImapConfig = (smtpConfig) => {
  console.log('Converting SMTP config to IMAP config:', JSON.stringify(smtpConfig, null, 2));
  
  let imapHost = smtpConfig.host;
  
  // Convert SMTP host to IMAP host
  if (imapHost.includes('smtp.')) {
    imapHost = imapHost.replace('smtp.', 'imap.');
    console.log(`Converted SMTP host ${smtpConfig.host} to IMAP host ${imapHost}`);
  } else if (!imapHost.includes('imap.')) {
    // cPanel usually uses mail.domain.com for all protocols
    // Keep as is if it's mail.domain.com
    console.log(`Using host as-is: ${imapHost}`);
  }
  
  const imapConfig = {
    host: imapHost,
    port: smtpConfig.security === 'SSL' || smtpConfig.security === 'TLS' ? 993 : 143,
    secure: smtpConfig.security === 'SSL' || smtpConfig.security === 'TLS',
    auth: {
      user: smtpConfig.username,
      pass: smtpConfig.password
    },
    // Add logger to help with debugging
    logger: false,
    // Increase timeouts for better reliability
    disableAutoIdle: true,
    connectionTimeout: 30000, // 30 seconds
    greetingTimeout: 15000,   // 15 seconds
    socketTimeout: 60000,     // 60 seconds
    // Disable TLS verification in development to avoid certificate issues
    tls: {
      rejectUnauthorized: false
    }
  };
  
  console.log('Final IMAP config:', JSON.stringify({
    ...imapConfig,
    auth: { ...imapConfig.auth, pass: '***' } // Don't log the actual password
  }, null, 2));
  
  return imapConfig;
};

// Helper function to provide error suggestions
const getErrorSuggestion = (error) => {
  if (error.message.includes('auth')) {
    return 'Please check your username and password.';
  } else if (error.message.includes('certificate')) {
    return 'Check your security settings or try a different security option.';
  } else if (error.message.includes('connect')) {
    return 'Check your host and port settings.';
  } else if (error.message.includes('timeout')) {
    return 'The server is not responding. Check your network connection.';
  }
  return 'Check your email settings. For cPanel, use mail.yourdomain.com with port 993 for SSL';
};

// Route to check IMAP connection and fetch emails
app.post('/api/fetch-email', async (req, res) => {
  try {
    const { action, emailConfig } = req.body;
    
    if (!action || !emailConfig) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    const imapConfig = getImapConfig(emailConfig);
    
    console.log('IMAP Configuration:', JSON.stringify({
      host: imapConfig.host,
      port: imapConfig.port,
      secure: imapConfig.secure,
      auth: { user: imapConfig.auth.user, pass: '***' } // Don't log the actual password
    }));
    
    console.log('Connecting to IMAP server:', imapConfig.host);
    
    // Create IMAP client
    console.log('Creating ImapFlow client...');
    const client = new ImapFlow(imapConfig);
    
    try {
      // Connect
      console.log('Attempting to connect to IMAP server...');
      await client.connect();
      console.log('Connected to IMAP server successfully');
      
      // Select INBOX
      const mailbox = await client.mailboxOpen('INBOX');
      console.log(`Mailbox has ${mailbox.exists} messages`);
      
      // Initialize messages array
      const messages = [];
      
      if (action === 'check' || action === 'fetch') {
        if (mailbox.exists > 0) {
          // Get message sequence numbers for last 50 messages
          const startSeq = Math.max(1, mailbox.exists - 49);
          const endSeq = mailbox.exists;
          
          // Fetch messages
          for await (const msg of client.fetch(`${startSeq}:${endSeq}`, {
            envelope: true,
            bodyParts: true,
            source: true
          })) {
            try {
              // Parse the email
              const parsed = await simpleParser(msg.source);
              
              // Add to messages array
              messages.push({
                uid: msg.uid?.toString() || '',
                messageId: parsed.messageId,
                sender: parsed.from?.text || '',
                senderEmail: parsed.from?.value?.[0]?.address || '',
                senderName: parsed.from?.value?.[0]?.name || '',
                recipient: parsed.to?.text || emailConfig.username,
                subject: parsed.subject || '(No Subject)',
                body: parsed.text || '',
                htmlBody: parsed.html || '',
                receivedAt: parsed.date?.toISOString() || new Date().toISOString(),
                headers: Object.fromEntries(parsed.headers || []),
                inReplyTo: parsed.inReplyTo || null,
                references: parsed.references || null
              });
            } catch (parseError) {
              console.error('Error parsing message:', parseError);
            }
          }
        }
      }
      
      // Logout
      await client.logout();
      
      return res.status(200).json({
        success: true,
        message: 'Emails fetched successfully',
        totalMessages: mailbox.exists,
        newMessages: messages.length,
        fetchedEmails: messages
      });
      
    } catch (imapError) {
      console.error('IMAP Error:', imapError);
      console.error('Error details:', JSON.stringify({
        name: imapError.name,
        message: imapError.message,
        stack: imapError.stack,
        code: imapError.code
      }));
      
      // Provide more specific error messages based on common IMAP connection issues
      let errorMessage = 'Failed to connect to IMAP server';
      let suggestion = 'Check your email settings. For cPanel, use mail.yourdomain.com with port 993 for SSL';
      
      if (imapError.message.includes('auth')) {
        errorMessage = 'Authentication failed';
        suggestion = 'Please check your username and password.';
      } else if (imapError.message.includes('certificate')) {
        errorMessage = 'SSL/TLS certificate verification failed';
        suggestion = 'Check your security settings or try a different security option.';
      } else if (imapError.message.includes('connect')) {
        errorMessage = 'Connection to server failed';
        suggestion = 'Check your host and port settings.';
      } else if (imapError.message.includes('timeout')) {
        errorMessage = 'Connection timed out';
        suggestion = 'The server is not responding. Check your network connection.';
      }
      
      return res.status(500).json({
        success: false,
        error: errorMessage,
        details: imapError.message,
        suggestion: suggestion
      });
    }
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Route to test IMAP connection
app.post('/api/test-connection', async (req, res) => {
  try {
    const { emailConfig } = req.body;
    
    if (!emailConfig) {
      return res.status(400).json({
        success: false,
        error: 'Missing email configuration'
      });
    }
    
    const imapConfig = getImapConfig(emailConfig);
    
    try {
      const client = new ImapFlow(imapConfig);
      await client.connect();
      const mailbox = await client.mailboxOpen('INBOX');
      await client.logout();
      
      return res.status(200).json({
        success: true,
        message: 'Connection test successful',
        mailboxInfo: {
          totalMessages: mailbox.exists,
          host: imapConfig.host,
          port: imapConfig.port
        }
      });
      
    } catch (testError) {
      return res.status(500).json({
        success: false,
        error: 'Connection test failed',
        details: testError.message,
        suggestion: getErrorSuggestion(testError)
      });
    }
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start the server
app.listen(port, () => {
  console.log(`IMAP Server running on port ${port}`);
});