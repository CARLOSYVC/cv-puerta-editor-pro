const supplierIntentKey = 'purchase-order-supplier-intent'
const receivingIntentKey = 'receiving-order-intent'

export function navigateToPurchaseOrderForSupplier(supplierId: string): void {
  sessionStorage.setItem(supplierIntentKey, supplierId)
  window.location.hash = 'purchase-orders'
}

export function consumePurchaseOrderSupplierIntent(): string | null {
  const supplierId = sessionStorage.getItem(supplierIntentKey)
  if (supplierId) sessionStorage.removeItem(supplierIntentKey)
  return supplierId
}

export function navigateToReceivingOrder(orderId: string): void {
  sessionStorage.setItem(receivingIntentKey, orderId)
  window.location.hash = 'receiving'
}

export function consumeReceivingOrderIntent(): string | null {
  const orderId = sessionStorage.getItem(receivingIntentKey)
  if (orderId) sessionStorage.removeItem(receivingIntentKey)
  return orderId
}
