const mongoose = require("mongoose");
const schema = mongoose.Schema;

const depositSchema = new schema({
  email: {
    type: String,
    required: [false, "your email is required"],
  },
  userid: {
    type: String,
    required: [false, "please enter your userid"],
  },
  accountNumber: {
    type: String,
    required: [false, "please enter your account number"],
  },
  status: {
    type: String,
    required: [false, "the status of your transaction"],
    default: "success",
  },
  amount: {
    type: Number,
    required: [false, "please enter the amount"],
  },
  account: {
    type: String,
    required: [false, "please select your account"],
  },
   reference: {
    type: String,
    required: [false, "please select your account"],
  },
  dateDeposited: {
    type: Date,
    required: true,
    default: Date.now(),
  },
});

module.exports = mongoose.model("deposits", depositSchema);
