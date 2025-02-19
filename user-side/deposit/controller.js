const axios = require("axios");
const deposit = require("./schema");
const User = require("../users/schema");
const { sendSMS } = require("../../utils/sendSMS");
require("dotenv").config();
const crypto = require("crypto");

const getDepositPage = (req, res) => {
  res.send("This is the deposit page");
};


const makeDeposit = async (req, res) => {
  const { userid, email, amount, account, accountNumber } = req.body;

  // Query for the user details
  try {
    const user = await User.findOne({ accountNumber });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const params = {
      email: email,
      amount: amount * 100, // Paystack expects amount in kobo
    };

    const depositAmount = parseFloat(amount);
    const options = {
      method: "POST",
      url: "https://api.paystack.co/transaction/initialize",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
       data: {
    ...params,
    redirect_url: "https://www.gntdacreditunion.com/dashboard", // Replace with your desired redirect URL
  },
      channels:["card", "mobile_money"],
    };

    const response = await axios(options);

    // Create new deposit record with pending status
    const newDeposit = await deposit.create({
      email,
      userid,
      amount,
      account,
      accountNumber,
      reference: response.data.data.reference,
      status:"pending"
    });

    // Update user balance based on account type
    

    // await user.save(); // Save the updated user balance

    res.json({
      
      message: "Deposit initialized successfully",
      data: response.data,
      newDeposit,
    });
  } catch (err) {
    console.error("Error during deposit initialization: ", err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

const manualDeposit = async (req, res) => {
  const { userid, email, amount, account, accountNumber } = req.body;

  try {
    // Find the user by account number
    const user = await User.findOne({ accountNumber });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Ensure that the amount is treated as a number
    const depositAmount = parseFloat(amount);

    // Update the user's balance based on the account type
    switch (account) {
      case "shares":
        user.sharesBalance += depositAmount;
        break;
      case "savings":
        user.savingsBalance += depositAmount;
        break;
      case "tsme":
        user.tsmeBalance += depositAmount;
        break;
      case "tlife":
        user.tlifeBalance += depositAmount;
        break;
      case "tkids":
        user.tkidsBalance += depositAmount;
        break;
      case "tedu":
        user.teduBalance += depositAmount;
        break;
      default:
        return res.status(400).json({ message: "Invalid account type" });
    }

    // Save the updated user balance
    await user.save();

    // Create a new deposit record
    const newDeposit = await deposit.create({
      email: user.email,
      userid,
      amount: depositAmount, // Ensure the correct amount is stored
      account,
      accountNumber,
    });

    // Send confirmation SMS
    const mobileNumber = user.mobileNumber;
    const url = "https://www.gntdacreditunion.com";
    const message = `Hello ${email},\n\nYour account has been credited with GHS ${amount} by Kan GNTDA Union Bank. Click here to confirm: ${url}\nRegards,\nTeam`;
    await sendSMS(mobileNumber, message);

    // Respond with success message and deposit details
    res.json({
      status: "success",
      message: "Deposit processed successfully",
      newDeposit,
    });
  } catch (err) {
    console.error("Error during deposit processing: ", err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};


const verifyPayment = async (req, res) => {
  const { reference } = req.query;

  try {
    // Step 1: Verify the payment with Paystack
    const options = {
      method: "GET",
      url: `https://api.paystack.co/transaction/verify/${reference}`,
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    };

    const response = await axios(options);

    if (response.data.status && response.data.data.status === "success") {
      // Step 2: Query the deposit based on the reference
      const existingDeposit = await deposit.findOne({ reference });

      if (!existingDeposit) {
        return res.status(404).json({
          status: "error",
          message: "Deposit not found",
        });
      }

      // Step 3: Update the deposit status to success
      existingDeposit.status = "success";
      existingDeposit.dateDeposited = new Date();
      await existingDeposit.save();

      // Step 4: Update the user's balance
      const accountNumber = existingDeposit.accountNumber;
      const depositAmount = existingDeposit.amount;

      const existingUser = await User.findOne({ accountNumber });

      if (!existingUser) {
        return res.status(404).json({
          status: "error",
          message: "User not found",
        });
      }

      existingUser.balance += depositAmount;
      await existingUser.save();

      // Step 5: Send success response
      res.json({
        status: "success",
        message: "Payment verified and deposit updated successfully",
        data: response.data.data,
      });
    } else {
      res.status(400).json({
        status: "error",
        message: "Payment verification failed or payment was unsuccessful",
      });
    }
  } catch (error) {
    console.error("Error during payment verification: ", error);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

// Function to handle payment success event
// Function to handle payment failed event

// Function to handle payment success event
async function handlePaymentSuccess(event) {
  const transactionData = event.data;
  const { reference, amount } = transactionData;
  
  try {
    // Query the deposit by reference to find the corresponding record
    const existingDeposit = await deposit.findOne({ reference });

    if (!existingDeposit) {
      console.error("Deposit not found for reference:", reference);
      return;
    }

    // Check if the deposit status is already marked as success to avoid duplicate processing
    if (existingDeposit.status === "success") {
      console.log("Deposit already processed:", reference);
      return;
    }

    // Update the deposit status and date
    existingDeposit.status = "success";
    existingDeposit.dateDeposited = new Date();
    await existingDeposit.save();

    // Retrieve the user by account number associated with the deposit
    const user = await User.findOne({ accountNumber: existingDeposit.accountNumber });

    if (!user) {
      console.error("User not found for account number:", existingDeposit.accountNumber);
      return;
    }

    // Update the user's balance based on the account type
    const depositAmount = existingDeposit.amount;
    switch (existingDeposit.account) {
      case "shares":
        user.sharesBalance += depositAmount;
        break;
      case "savings":
        user.savingsBalance += depositAmount;
        break;
      case "tlife":
        user.tlifeBalance += depositAmount;
        break;
      case "tedu":
        user.teduBalance += depositAmount;
        break;
      case "tsme":
        user.tsmeBalance += depositAmount;
        break;
      default:
        console.error("Invalid account type");
        return;
    }

    await user.save();

    // Send confirmation SMS
    const mobileNumber = user.mobileNumber;
    const message = `Hello ${user.email},\n\nYour deposit of GHS ${amount / 100} has been successful.\nThank you for banking with us!\n- GNTDA Credit Union`;
    await sendSMS(mobileNumber, message);

    console.log("Payment processed successfully for reference:", reference);
  } catch (error) {
    console.error("Error processing payment success:", error);
  }
}

// Webhook endpoint
const webhook = async (req, res) => {
  const paystackSignature = req.headers["x-paystack-signature"];
  const payload = JSON.stringify(req.body);

  // Generate the expected signature using the Paystack secret key
  const expectedSignature = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(payload)
    .digest("hex");

  // Verify the signature
  if (paystackSignature !== expectedSignature) {
    return res.status(400).send("Invalid signature");
  }

  // Process the event data
  const event = req.body;

  // Handle only the charge.success event for successful deposits
  if (event.event === "charge.success") {
    await handlePaymentSuccess(event);
  } else {
    console.log(`Unhandled event: ${event.event}`);
  }

  // Acknowledge receipt of the event
  res.status(200).send("Event received");
};


module.exports = {
  getDepositPage,
  makeDeposit,
  verifyPayment,
  manualDeposit,
  webhook
};
