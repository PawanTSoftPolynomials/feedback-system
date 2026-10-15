// Brevo email integration, reused from the Orange Tree LMS backend (src/utils/mail.js):
// same Brevo REST endpoint and the same BREVO_API_KEY / MAIL_FROM environment variables.
const axios = require("axios");

const isEmailConfigured = () => Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM);

const sendEmail = async (to, subject, html) => {
  if (!isEmailConfigured()) {
    throw new Error("Email is not configured on the server (set BREVO_API_KEY and MAIL_FROM).");
  }
  try {
    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          email: process.env.MAIL_FROM,
          name: process.env.MAIL_FROM_NAME || "Orange Tree LMS",
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      },
      {
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": process.env.BREVO_API_KEY,
        },
        timeout: 15000,
      }
    );

    console.log("Email sent:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "Brevo Error:",
      error.response?.data || error.message
    );
    const detail = error.response?.data?.message || error.message;
    throw new Error(`Brevo could not accept the email: ${detail}`);
  }
};

module.exports = { sendEmail, isEmailConfigured };
