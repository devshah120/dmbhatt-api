// Email templates for invoice notifications
const emailTemplates = {
  invoiceConfirmation: (user, invoice) => ({
    subject: `Invoice #${invoice.invoiceNumber} - Padhaku Desk`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #0085B3; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Padhaku Desk</h1>
          <p style="margin: 5px 0 0 0;">Invoice Confirmation</p>
        </div>

        <div style="padding: 30px; background-color: #f9f9f9; border: 1px solid #ddd;">
          <p>Dear ${user.firstName},</p>

          <p>Thank you for your purchase! Your invoice has been generated and is attached to this email.</p>

          <div style="background-color: white; border: 2px solid #0085B3; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #0085B3; margin-top: 0;">Invoice Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Invoice Number:</td>
                <td style="padding: 10px 0; text-align: right;">${invoice.invoiceNumber}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Description:</td>
                <td style="padding: 10px 0; text-align: right;">${invoice.description}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Amount:</td>
                <td style="padding: 10px 0; text-align: right; font-size: 18px; color: #0085B3; font-weight: bold;">₹${invoice.amount.toFixed(2)}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Payment ID:</td>
                <td style="padding: 10px 0; text-align: right; font-size: 12px; color: #999;">${invoice.razorpayPaymentId}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Date:</td>
                <td style="padding: 10px 0; text-align: right;">${new Date(invoice.createdAt || Date.now()).toLocaleDateString('en-IN')}</td>
              </tr>
            </table>
          </div>

          <div style="background-color: #e8f4f8; border-left: 4px solid #0085B3; padding: 15px; border-radius: 3px; margin: 20px 0;">
            <p style="margin: 0; color: #0085B3;">
              <strong>📎 Invoice PDF attached:</strong> Please save this document for your records.
            </p>
          </div>

          <p style="margin-top: 20px; color: #666;">If you have any questions about your purchase, please don't hesitate to contact our support team.</p>

          <p style="margin-top: 30px; color: #666;">
            Best regards,<br>
            <strong style="color: #0085B3;">Padhaku Desk Team</strong>
          </p>
        </div>

        <div style="background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #999; border-radius: 0 0 8px 8px;">
          <p style="margin: 0;">© 2024 Padhaku Desk. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  planUpgradeConfirmation: (user, upgrade, invoice) => ({
    subject: `Plan Upgrade Confirmation - Invoice #${invoice.invoiceNumber}`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #27AE60; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Padhaku Desk</h1>
          <p style="margin: 5px 0 0 0;">Plan Upgrade Successful!</p>
        </div>

        <div style="padding: 30px; background-color: #f9f9f9; border: 1px solid #ddd;">
          <p>Dear ${user.firstName},</p>

          <p>Congratulations! Your plan upgrade has been processed successfully. You now have access to all the premium features.</p>

          <div style="background-color: white; border: 2px solid #27AE60; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #27AE60; margin-top: 0;">Upgrade Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Previous Standard:</td>
                <td style="padding: 10px 0; text-align: right;">${upgrade.oldStandard}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">New Standard:</td>
                <td style="padding: 10px 0; text-align: right; color: #27AE60; font-weight: bold;">${upgrade.newStandard}</td>
              </tr>
              ${upgrade.medium ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Medium:</td>
                <td style="padding: 10px 0; text-align: right;">${upgrade.medium}</td>
              </tr>
              ` : ''}
              ${upgrade.stream ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Stream:</td>
                <td style="padding: 10px 0; text-align: right;">${upgrade.stream}</td>
              </tr>
              ` : ''}
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Amount Paid:</td>
                <td style="padding: 10px 0; text-align: right; font-size: 18px; color: #27AE60; font-weight: bold;">₹${invoice.amount.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Invoice Number:</td>
                <td style="padding: 10px 0; text-align: right;">${invoice.invoiceNumber}</td>
              </tr>
            </table>
          </div>

          <div style="background-color: #e8f8f0; border-left: 4px solid #27AE60; padding: 15px; border-radius: 3px; margin: 20px 0;">
            <p style="margin: 0; color: #27AE60;">
              <strong>✓ Your invoice is attached:</strong> Please keep it for your records and reference.
            </p>
          </div>

          <p style="margin-top: 20px; color: #666;">You can now access premium content and features. If you need any assistance, feel free to reach out to our support team.</p>

          <p style="margin-top: 30px; color: #666;">
            Best regards,<br>
            <strong style="color: #27AE60;">Padhaku Desk Team</strong>
          </p>
        </div>

        <div style="background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #999; border-radius: 0 0 8px 8px;">
          <p style="margin: 0;">© 2024 Padhaku Desk. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  materialPurchaseConfirmation: (user, product, invoice) => ({
    subject: `Material Purchase Confirmation - Invoice #${invoice.invoiceNumber}`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #0085B3; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Padhaku Desk</h1>
          <p style="margin: 5px 0 0 0;">Purchase Confirmation</p>
        </div>

        <div style="padding: 30px; background-color: #f9f9f9; border: 1px solid #ddd;">
          <p>Dear ${user.firstName},</p>

          <p>Thank you for purchasing study materials from Padhaku Desk! Your invoice is attached below.</p>

          <div style="background-color: white; border: 2px solid #0085B3; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #0085B3; margin-top: 0;">Purchase Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Material:</td>
                <td style="padding: 10px 0; text-align: right;">${product ? product.name : 'Study Material'}</td>
              </tr>
              ${product && product.description ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Description:</td>
                <td style="padding: 10px 0; text-align: right;">${product.description}</td>
              </tr>
              ` : ''}
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Amount Paid:</td>
                <td style="padding: 10px 0; text-align: right; font-size: 18px; color: #0085B3; font-weight: bold;">₹${invoice.amount.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Invoice Number:</td>
                <td style="padding: 10px 0; text-align: right;">${invoice.invoiceNumber}</td>
              </tr>
            </table>
          </div>

          <div style="background-color: #e8f4f8; border-left: 4px solid #0085B3; padding: 15px; border-radius: 3px; margin: 20px 0;">
            <p style="margin: 0; color: #0085B3;">
              <strong>📎 Invoice PDF attached:</strong> Your receipt and proof of purchase are included.
            </p>
          </div>

          <p style="margin-top: 20px; color: #666;">If you have any issues accessing your materials or have questions, please contact our support team.</p>

          <p style="margin-top: 30px; color: #666;">
            Best regards,<br>
            <strong style="color: #0085B3;">Padhaku Desk Team</strong>
          </p>
        </div>

        <div style="background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #999; border-radius: 0 0 8px 8px;">
          <p style="margin: 0;">© 2024 Padhaku Desk. All rights reserved.</p>
        </div>
      </div>
    `
  })
};

module.exports = emailTemplates;
