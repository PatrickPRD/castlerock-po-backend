const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

/**
 * Create an AWS SES email transporter
 * Requires: AWS_REGION, SES_FROM_EMAIL environment variables
 * Uses IAM role attached to EC2 instance for authentication
 */
function createSESTransporter() {
  if (!process.env.AWS_REGION) {
    throw new Error('AWS_REGION is not set');
  }

  if (!process.env.SES_FROM_EMAIL) {
    throw new Error('SES_FROM_EMAIL is not set');
  }

  // The v3 client will use the default AWS credential provider chain, including EC2 IAM roles.
  const ses = new SESClient({
    region: process.env.AWS_REGION
  });

  return ses;
}

/**
 * Send email via AWS SES
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML email body
 * @param {string} options.from - Sender email (defaults to SES_FROM_EMAIL)
 */
async function sendEmail({ to, subject, html, from }) {
  const ses = createSESTransporter();

  const params = {
    Source: from || process.env.SES_FROM_EMAIL,
    Destination: {
      ToAddresses: [to]
    },
    Message: {
      Subject: {
        Data: subject
      },
      Body: {
        Html: {
          Data: html
        }
      }
    }
  };

  try {
    const result = await ses.send(new SendEmailCommand(params));
    console.log(`Email sent to ${to}. Message ID: ${result.MessageId}`);
    return result;
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
    throw error;
  }
}

module.exports = {
  createSESTransporter,
  sendEmail
};
