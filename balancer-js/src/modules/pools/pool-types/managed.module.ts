import { ManagedPoolExit } from './concerns/managed/exit.concern';
import { ManagedPoolJoin } from './concerns/managed/join.concern';
import { ManagedPoolLiquidity } from './concerns/managed/liquidity.concern';
import { ManagedPoolSpotPrice } from './concerns/managed/spotPrice.concern';
import { ManagedPoolPriceImpact } from './concerns/managed/priceImpact.concern';
import { PoolType } from './pool-type.interface';
import {
  ExitConcern,
  JoinConcern,
  LiquidityConcern,
  PriceImpactConcern,
  SpotPriceConcern,
} from './concerns/types';

export class Managed implements PoolType {
  constructor(
    public exit: ExitConcern = new ManagedPoolExit(),
    public join: JoinConcern = new ManagedPoolJoin(),
    public liquidity: LiquidityConcern = new ManagedPoolLiquidity(),
    public spotPriceCalculator: SpotPriceConcern = new ManagedPoolSpotPrice(),
    public priceImpactCalculator: PriceImpactConcern = new ManagedPoolPriceImpact()
  ) {}
}
