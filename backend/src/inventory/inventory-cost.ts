import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

export function weightedAverageUnitCost(
  currentStock: Prisma.Decimal,
  currentUnitCost: Prisma.Decimal,
  incoming: Array<{ quantity: Prisma.Decimal; unitCost: Prisma.Decimal }>,
): Prisma.Decimal {
  if (currentStock.lessThan(0)) {
    throw new BadRequestException(
      'Existing inventory is negative; reconcile the stock before receiving purchases',
    );
  }

  const incomingQuantity = incoming.reduce(
    (total, item) => total.add(item.quantity),
    new Prisma.Decimal(0),
  );
  if (incomingQuantity.lessThanOrEqualTo(0)) {
    throw new BadRequestException('Received quantity must be greater than zero');
  }

  const incomingValue = incoming.reduce(
    (total, item) => total.add(item.quantity.mul(item.unitCost)),
    new Prisma.Decimal(0),
  );
  const totalQuantity = currentStock.add(incomingQuantity);
  const totalValue = currentStock.mul(currentUnitCost).add(incomingValue);

  return totalValue.div(totalQuantity).toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}
