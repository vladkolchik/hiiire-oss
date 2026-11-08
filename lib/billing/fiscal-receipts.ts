function formatReceiptOutSum(amountKopecks: number): string {
  return (amountKopecks / 100).toFixed(2);
}

export function buildSubscriptionReceipt(input: { planLabel: string; amountKopecks: number }) {
  return {
    sno: "osn",
    items: [
      {
        name: `Подписка hiiire ${input.planLabel} на 1 месяц`,
        quantity: 1,
        sum: formatReceiptOutSum(input.amountKopecks),
        tax: "none",
        payment_method: "full_payment",
        payment_object: "service",
      },
    ],
  };
}
