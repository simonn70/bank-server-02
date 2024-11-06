const express = require("express");
const router = express.Router();
const {
  getDepositPage,
  makeDeposit,
  verifyPayment,
  manualDeposit,
  webhook,
} = require("./controller");
const { requireAuthUser } = require("../../utils/authZ");

router.get("/", getDepositPage);
router.get("/verify", verifyPayment);
router.post("/", makeDeposit);
router.post("/manual", manualDeposit);
router.post("/webhook", webhook);


module.exports = router;
