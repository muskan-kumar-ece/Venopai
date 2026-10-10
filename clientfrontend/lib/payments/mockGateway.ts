/**
 * Local simulation payment gateway helper.
 * Strictly gated behind non-production environment and explicit opt-in.
 * Throws immediately if invoked in production.
 */
export function simulateMockPayment(_gatewayOrderId: string): {
  paymentId: string;
  signature: string;
} {
  if (process.env.NODE_ENV === "production") {
    throw new Error("CRITICAL SECURITY ERROR: Mock payment simulation is strictly prohibited in production.");
  }
  void _gatewayOrderId;
  if (process.env.NEXT_PUBLIC_ENABLE_MOCK_PAYMENTS !== "true") {
    throw new Error("Mock payments are disabled. Real payment gateway credentials required.");
  }

  return {
    paymentId: `pay_sim_${Date.now()}`,
    signature: "mock_valid_signature",
  };
}
