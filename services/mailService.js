const nodemailer = require("nodemailer");
const imaps = require("imap-simple");



const sendMailIMAP = async ({
  to,
  subject,
  html,
  attachments = [],
  showInSendBox = false,
}) => {
  try {
    const mailOptions = {
      from: `"Leo Charter Services" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      attachments,
    };
    const transporter = nodemailer.createTransport({
   host: "smtp.gmail.com", // change to your SMTP host
   port: 465,              // 465 = SSL, 587 = TLS
   secure: true,           // true for 465, false for 587
   auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

    const info = await transporter.sendMail(mailOptions);

    if (!showInSendBox) {
      await deleteFromSentBySubject(subject);
    }

    return { success: true, info };
  } catch (error) {
    console.error("Email send error:", error);
    return { success: false, error };
  }
};

const deleteFromSentBySubject = async (subject) => {
  const config = {
    imap: {
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASS,
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    },
  };

  const sleep = (ms) => new Promise(res => setTimeout(res, ms));

  try {
    await sleep(3000); // Give Gmail time to sync message to Sent

    const connection = await imaps.connect(config);

    const sentFolders = ["[Gmail]/Sent Mail", "[Gmail]/Sent", "Sent"];
    let boxOpened = false;

    for (const folder of sentFolders) {
      try {
        await connection.openBox(folder);
        boxOpened = true;
        break;
      } catch (_) {}
    }

    if (!boxOpened) {
      console.log("No Sent folder found");
      connection.end();
      return;
    }

    const results = await connection.search(
      ['ALL', ['HEADER', 'SUBJECT', subject]],
      { bodies: [], struct: true }
    );

    if (results.length > 0) {
      const uid = results[0].attributes.uid;

      await connection.addFlags(uid, "\\Deleted");
      await connection.imap.expunge();

      // console.log(`Deleted from Sent: ${subject}`);
    }

    connection.end();
  } catch (err) {
    console.error("IMAP delete error:", err);
  }
};








// Reusable Send Mail function
const sendMail = async ({
  to,
  subject,
  html,
  isNoReply = false,
  attachments = [],
}) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", // change to your SMTP host
      port: 465,              // 465 = SSL, 587 = TLS
      secure: true,           // true for 465, false for 587
      replyTo: process.env.EMAIL_USER,
      auth: {
        user: isNoReply ? process.env.NO_REPLY_EMAIL_USER : process.env.EMAIL_USER,
        pass: isNoReply ? process.env.NO_REPLY_EMAIL_PASS : process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: isNoReply ? `"Leo Charter Services" <${process.env.NO_REPLY_EMAIL_USER}>` : `"Leo Charter Services" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      attachments,
    };

    const info = await transporter.sendMail(mailOptions);

    return { success: true, info };
  } catch (error) {
    console.error("Email send error:", error);
    return { success: false, error };
  }
};

module.exports = { sendMail, sendMailIMAP };