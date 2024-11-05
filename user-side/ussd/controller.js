const axios = require("axios");
const Withdrawal = require("../withdrawal/schema");
const Deposit = require("../deposit/schema");
const User = require("../users/schema");
// const PAYSTACK_SECRET_KEY = "sk_live_b656166f9c8b4216425d78a0ef4c49a390d84cbd"; THE EDGE
const PAYSTACK_SECRET_KEY = "sk_live_a743c2a86245b1a0de3286a11f5cc4b87727b705"; 

const NETWORKS = {
  MTN: {
    apiUrl: "https://mtn-api.example.com",
    apiKey: "mtn_api_key",
    prefixes: ["054", "055"],
    provider: "mtn",
  },
  AIRTELTIGO: {
    apiUrl: "https://airtel-api.example.com",
    apiKey: "airtel_api_key",
    prefixes: ["020", "021"],
    provider: "airtel",
  },
  VODAFONE: {
    apiUrl: "https://vodafone-api.example.com",
    apiKey: "vodafone_api_key",
    prefixes: ["027", "028"],
    provider: "vodafone",
  },
};

const ACCOUNT_TYPE_MAP = {
  "GNTDA Shares": "shares",
  "GNTDA Savings": "savings",
  // "Citti Investment": "investment",
};

async function chargeWithPaystack(phone, accountNumber, amount, network) {
  console.log(phone, amount);
  const value = parseFloat(amount);

  try {
  const response = await axios.post(
  "https://api.paystack.co/charge",
  {
    amount: value*100, // Amount in kobo or pesewas
    email: "simonadjei70@gmail.com", // Customer's email
    currency: "GHS", // Currency, e.g., "GHS" for Ghanaian Cedi
    mobile_money: {
      phone: phone, // Customer's phone number
      provider: "mtn", // Mobile money provider, e.g., "mtn"
    },
    authorization: {
      mode: "recurring", // Set the authorization mode to recurring
      recurring_charge: true, // Indicate it's a recurring charge
    }
  },
  {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, // Paystack secret key
      "Content-Type": "application/json", // Content-Type header
    },
  }
);

    console.log(response.data);

    return response.data.data;
  } catch (error) {
    console.error(
      "Error charging with Paystack:",
      error.response ? error.response.data : error.message
    );

    throw error;
  }
}

async function checkBalance(accountNumber, selectedAccount) {
  const user = await User.findOne({ accountNumber });

  if (!user) {
    throw new Error("Account not found");
  }

  const accountType = ACCOUNT_TYPE_MAP[selectedAccount];
  let balance;
  if (accountType === "shares") {
    balance = user.sharesBalance;
  } else if (accountType === "savings") {
    balance = user.savingsBalance;
  }

  return balance;
}

async function verifyAccountNumber(accountNumber) {
  const user = await User.findOne({ accountNumber });
  return !!user;
}

let sessionData = {};

async function ussdHandler(req, res) {
  const { userData, sessionID, userID, msisdn, network } = req.body;
  let message = "";
  let continueSession = false;

  if (!network) {
    message = "Network not supported. Please contact support.";
  } else if (!sessionData[sessionID]?.accountNumber) {
    if (!userData || userData === "*928*443#") {
      message =
        "Welcome to GNTDA Credit Union\nPlease enter your account number:";
      continueSession = true;
    } else if (userData.length >= 4 && !isNaN(userData)) {
      const accountNumber = userData;
      const isValidAccount = await verifyAccountNumber(accountNumber);
      if (isValidAccount) {
        sessionData[sessionID] = { accountNumber };
        message =
          "What would you like to do?\n1. Deposit\n2. Withdraw\n3. Check Balance\n4. Exit";
        continueSession = true;
      } else {
        message = "Invalid account number. Please try again.";
        continueSession = true;
      }
    } else {
      message = "Invalid input. Please enter a valid account number.";
      continueSession = true;
    }
  } else {
    const userInput = userData.trim();
    const session = sessionData[sessionID];
    const accountNumber = session.accountNumber;

    if (!session.selectedAction && (userInput === "3" || userInput === "4")) {
      if (userInput === "3") {
        message =
          "Which account balance do you want to check?\n1. GNTDA Shares\n2. GNTDA Savings";
        session.selectedAction = "checkBalance";
        continueSession = true;
      } else if (userInput === "4") {
        message = "Thank you for using the USSD Service.";
        delete sessionData[sessionID];
      }
    } else if (
      session.selectedAction === "checkBalance" &&
      (userInput === "1" || userInput === "2")
    ) {
      session.selectedAccount =
        userInput === "1" ? "GNTDA Shares" : "GNTDA Savings";
      const accountType = ACCOUNT_TYPE_MAP[session.selectedAccount];
      try {
        const balance = await checkBalance(
          accountNumber,
          session.selectedAccount
        );
        message = `Your ${session.selectedAccount} balance is GHS ${balance}.`;
        delete sessionData[sessionID];
      } catch (error) {
        message = "There was an issue fetching your balance. Please try again.";
        continueSession = true;
      }
    } else if (
      !session.selectedAction &&
      (userInput === "1" || userInput === "2")
    ) {
      session.selectedAction = userInput;
      message = `Which account do you want to ${
        userInput === "1" ? "deposit into" : "withdraw from"
      }?\n1. GNTDA Savings\n2. GNTDA Shares`;
      continueSession = true;
    } else if (
      !session.selectedAccount &&
      (userInput === "1" || userInput === "2")
    ) {
      session.selectedAccount =
        userInput === "1" ? "GNTDA Savings" : "GNTDA Shares";
      message = `Enter Amount for ${
        session.selectedAction === "1" ? "Deposit" : "Withdrawal"
      }:`;
      continueSession = true;
    } else if (session.selectedAction === "2") {
      if (!session.amount) {
        session.amount = Number(userInput);
        if (isNaN(session.amount) || session.amount <= 0) {
          message = "Invalid input. Please enter a valid amount.";
          continueSession = true;
        } else {
          message = "Enter the purpose of withdrawal:";
          continueSession = true;
        }
      } else if (!session.purpose) {
        session.purpose = userInput;

        // Process withdrawal
        try {
          const newWithdrawal = new Withdrawal({
            accountNumber: accountNumber,
            account: ACCOUNT_TYPE_MAP[session.selectedAccount],
            amount: session.amount,
            purpose: session.purpose,
            status: "pending",
          });
          await newWithdrawal.save();
          message = `Your withdrawal of GHS ${session.amount} for '${session.purpose}' has been initiated.`;
          delete sessionData[sessionID];
        } catch (error) {
          message =
            "There was an issue initiating your withdrawal. Please try again.";
          continueSession = true;
        }
      }
    } else if (session.selectedAction === "1") {
      if (!session.amount) {
        session.amount = Number(userInput);
        if (isNaN(session.amount) || session.amount <= 0) {
          message = "Invalid input. Please enter a valid amount.";
          continueSession = true;
        } else {
          try {
            const chargeResult = await chargeWithPaystack(
              msisdn,
              accountNumber,
              session.amount,
              network
            );

            // Handle OTP scenario
            if (chargeResult.status === "send_otp") {
              session.awaitingOtp = true;
              session.transactionReference = chargeResult.reference;
              message = chargeResult.display_text;
              continueSession = true;
            } else {
              // Save deposit to DB
              const newDeposit = new Deposit({ 
                accountNumber: accountNumber,
                account: ACCOUNT_TYPE_MAP[session.selectedAccount],
                amount: session.amount ,
                status:
                  chargeResult.status === "success" ? "success" : "success ",
              });
              await newDeposit.save();

              message =`Your deposit of GHS ${session.amount} has been processed successfully kindly go to your approvals if you dont receive a prompt .`
                  
              delete sessionData[sessionID];
            }
          } catch (error) {
            message = "There was an issue with your deposit. Please try again.";
            continueSession = true;
          }
        }
      } else if (session.awaitingOtp) {
        const otp = userInput;
        try {
          const otpResponse = await axios.post(
            "https://api.paystack.co/charge/submit_otp",
            {
              otp: otp,
              reference: session.transactionReference,
            },
            {
              headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json",
              },
            }
          );

          // Save deposit to DB
          const newDeposit = new Deposit({
            accountNumber: accountNumber,
            account: ACCOUNT_TYPE_MAP[session.selectedAccount],
            amount: session.amount,
            status:
              otpResponse.data.status === "success" ? "success" : "rejected",
          });
          await newDeposit.save();

          message =
            otpResponse.data.status === "success"
              ? `Your deposit of GHS ${session.amount} was successful.`
              : "Deposit failed. Please try again.";
          delete sessionData[sessionID];
        } catch (error) {
          message = "There was an issue processing your OTP. Please try again.";
          continueSession = true;
        }
      }
    } else {
      message = "Invalid input. Please try again.";
      continueSession = true;
    }
  }

  res.json({
    sessionID,
    userID,
    msisdn,
    message,
    continueSession,
  });
}


module.exports = {
  ussdHandler,
};
