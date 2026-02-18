const AWS = require('aws-sdk');

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

  // Configure AWS SDK to use IAM role from EC2 instance
  const ses = new AWS.SES({
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
    const result = await ses.sendEmail(params).promise();
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
