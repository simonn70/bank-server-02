const axios = require("axios");
const Withdrawal = require("./schema");
const User = require("../users/schema");
const { sendSMS } = require("../../utils/sendSMS");

const getWithdrawalPage = (req, res) => {
  res.send("This is the withdrawal page");
};

const makeWithdrawal = async (req, res) => {
  const { amount, accountNumber, purpose, account } = req.body;
  try {
    // const response = await paystack.transaction.initialize({
    //   amount: amount * 100, // Convert amount to kobo
    //   email,
    // });
    //tag pending
    const newWithdrawal = await Withdrawal.create({
      account,
      amount,
      purpose,
      accountNumber,
      // Add reference to the withdrawal record
    });

    res.status(200).json({
      newWithdrawal,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error." });
  }
};

const manualWithdrawal = async (req, res) => {
  const { amount, accountNumber, purpose, account } = req.body;

  try {
    // Find the user by account number
    const user = await User.findOne({ accountNumber });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Ensure that the amount is treated as a number
    const withdrawalAmount = parseFloat(amount);

    // Check if the balance is sufficient for the specified account type
    switch (account) {
      case "shares":
        if (user.sharesBalance < withdrawalAmount) {
          return res.status(400).json({ message: "Insufficient balance in shares" });
        }
        user.sharesBalance -= withdrawalAmount;
        break;
      case "savings":
        if (user.savingsBalance < withdrawalAmount) {
          return res.status(400).json({ message: "Insufficient balance in savings" });
        }
        user.savingsBalance -= withdrawalAmount;
        break;
      case "tsme":
        if (user.tsmeBalance < withdrawalAmount) {
          return res.status(400).json({ message: "Insufficient balance in tsme" });
        }
        user.tsmeBalance -= withdrawalAmount;
        break;
      case "tlife":
        if (user.tlifeBalance < withdrawalAmount) {
          return res.status(400).json({ message: "Insufficient balance in tlife" });
        }
        user.tlifeBalance -= withdrawalAmount;
        break;
      case "tkids":
        if (user.tkidsBalance < withdrawalAmount) {
          return res.status(400).json({ message: "Insufficient balance in tkids" });
        }
        user.tkidsBalance -= withdrawalAmount;
        break;
      case "tedu":
        if (user.teduBalance < withdrawalAmount) {
          return res.status(400).json({ message: "Insufficient balance in tedu" });
        }
        user.teduBalance -= withdrawalAmount;
        break;
      default:
        return res.status(400).json({ message: "Invalid account type" });
    }

    // Save the updated user balance
    await user.save();

    // Create a new withdrawal record
    const newWithdrawal = await Withdrawal.create({
      account,
      amount: withdrawalAmount, // Ensure the correct amount is stored
      purpose,
      accountNumber,
      status: "success",
    });

    // Send confirmation SMS
    const mobileNumber = user.mobileNumber;
    const url = "https://www.gntdacreditunion.com";
    const message = `Hello ${user.email},\n\nYour account has been debited with GHS ${withdrawalAmount} by GNTDA Credit Union Bank. Click here to confirm: ${url}\nRegards,\nTeam`;
    await sendSMS(mobileNumber, message);

    // Respond with success message and withdrawal details
    res.status(200).json({
      newWithdrawal,
      message: "Withdrawal processed successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error." });
  }
};



const Withdrawals = async (req, res) => {
  const { amount, accountNumber, purpose, account, withdrawalId } = req.body;

  try {
    // Find the withdrawal by ID
    const withdrawal = await Withdrawal.findById(withdrawalId);

    if (!withdrawal) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }

    // Check if the withdrawal has already been processed
    if (withdrawal.status === "success") {
      return res.status(400).json({ message: "Withdrawal already processed" });
    }

    // Find the user by account number
    const user = await User.findOne({ accountNumber });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Ensure that the amount is treated as a number
    const withdrawalAmount = parseFloat(amount);

    // Update the user's balance based on the account type
    if (account === "shares") {
      if (user.sharesBalance < withdrawalAmount) {
        return res.status(400).json({ message: "Insufficient balance in shares" });
      }
      user.sharesBalance -= withdrawalAmount;
    } else if (account === "savings") {
      if (user.savingsBalance < withdrawalAmount) {
        return res.status(400).json({ message: "Insufficient balance in savings" });
      }
      user.savingsBalance -= withdrawalAmount;
    } else if (account === "tlife") {
      if (user.tlifeBalance < withdrawalAmount) {
        return res.status(400).json({ message: "Insufficient balance in tlife" });
      }
      user.tlifeBalance -= withdrawalAmount;
    } else if (account === "tedu") {
      if (user.teduBalance < withdrawalAmount) {
        return res.status(400).json({ message: "Insufficient balance in tedu" });
      }
      user.teduBalance -= withdrawalAmount;
    } else if (account === "tsme") {
      if (user.tsmeBalance < withdrawalAmount) {
        return res.status(400).json({ message: "Insufficient balance in tsme" });
      }
      user.tsmeBalance -= withdrawalAmount;
    } else {
      return res.status(400).json({ message: "Invalid account type" });
    }

    // Save the updated user balance
    await user.save();

    // Update the withdrawal record to "success"
    withdrawal.status = "success";
    await withdrawal.save();

    // Send confirmation SMS
    const mobileNumber = user.mobileNumber;
    const url = "https://www.gntdacreditunion.com";
    const message = `Hello ${user.email},\n\nYour account has been debited with GHS ${withdrawalAmount} by GNTDA Credit Union Bank. Click here to confirm: ${url}\nRegards,\nTeam`;
    await sendSMS(mobileNumber, message);

    res.status(200).json({
      withdrawal,
      message: "Withdrawal processed successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error." });
  }
};



const createRecipientAndTransfer = async (req, res) => {
  const { accountNumber, bank_code, amount, type, currency, reason } = req.body;
  try {
    //query fr the user
    const user = await User.findOne({ accountNumber });
    console.log(user);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // Step 1: Create the Transfer Recipient
    const recipientResponse = await axios.post(
      "https://api.paystack.co/transferrecipient",
      {
        type: "mobile_money", // Set the type to 'mobile_money'
        name: user.name,
        // Use the appropriate currency code, e.g., "GHS" for Ghana
        bank_code: "MTN", // Set the mobile money provider's bank code, e.g., "MTN" for MTN Mobile Money
        // Use the mobile money number here
        currency: "GHS",
        account_number: user.mobileNumber,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(recipientResponse);

    const recipientCode = recipientResponse.data.data.recipient_code;
    console.log(recipientCode);
    

    // Step 2: Initiate the Transfer
    const transferResponse = await axios.post(
      "https://api.paystack.co/transfer",
      {
        source: "balance",
        amount:1000*100,
        recipient: recipientCode,
        
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(transferResponse);
    

    const transferId = transferResponse.data.data.id;

    // Step 3: Verify the Transfer
  
    if (transferId) {
      //update the withdrawal to success
      // Send the combined response
      res.status(201).json({
        status: "success",
        message: "Recipient created and transfer initiated successfully",
        recipient: recipientResponse.data.data,
        transfer: transferResponse.data.data,
       
      });
    } else {
      // Handle cases where the transfer is not successful
      res.status(400).json({
        status: "error",
        message:
          "Transfer failed or is pending. Please check the transfer status.",
        recipient: recipientResponse.data.data,
        transfer: transferResponse.data.data,
        
      });
    }
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error
    });
  }
};

const rejectWithdrawal = async (req, res) => {
  const { withdrawalId} = req.body;  // Destructure the 'id' from req.body
  console.log(req);  // Make sure the ID is correctly logged

  try {
    // Find the withdrawal by ID and update its status to "rejected"
    const updatedWithdrawal = await Withdrawal.findByIdAndUpdate(
     withdrawalId,  // Use the destructured 'id'
      { status: "rejected" },
      { new: true }
    );

    // if (!updatedWithdrawal) {
    //   return res.status(404).json({
    //     status: "error",
    //     message: "Withdrawal not found",
    //   });
    // }

    res.status(200).json({
      status: "success",
      message: "Withdrawal rejected successfully",
      withdrawal: updatedWithdrawal,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.response ? error.response.data.message : error.message,
    });
  }
};


module.exports = {
  getWithdrawalPage,
  makeWithdrawal,
  manualWithdrawal,
  rejectWithdrawal,Withdrawals,
  createRecipientAndTransfer
};

//withdraw and based on the account it should dedact from the balance of the account

// const axios = require("axios");
// const { PAYSTACK_SECRET_KEY } = require("../config/config");

// Create Transfer Recipient and Initiate Transfer
