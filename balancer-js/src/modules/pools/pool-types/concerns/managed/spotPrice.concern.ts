import { Pool } from '@/types';
import { parseFixed } from '../../../../../lib/utils';
import { SpotPriceConcern } from '../types';

export class ManagedPoolSpotPrice implements SpotPriceConcern {
  calcPoolSpotPrice(tokenIn: string, tokenOut: string, pool: Pool): string {
    // const isBPTAsToken = tokenIn === pool.address || tokenOut === pool.address;
    // if (isBPTAsToken) {
    //   const bptAsToken: PoolToken = {
    //     address: pool.address,
    //     balance: pool.totalShares,
    //     decimals: 18,
    //     priceRate: '1',
    //     weight: '0',
    //   };
    //   pool.tokens.push(bptAsToken);
    //   pool.tokensList.push(pool.address);
    // }
    // const managedPool = WeightedPool.fromPool(pool as SubgraphPoolBase);
    // const poolPairData = managedPool.parsePoolPairData(tokenIn, tokenOut);
    // const spotPrice = managedPool
    //   ._spotPriceAfterSwapExactTokenInForTokenOut(poolPairData, ZERO)
    //   .toString();
    // if (isBPTAsToken) {
    //   pool.tokens.pop();
    //   pool.tokensList.pop();
    // }
    // return spotPrice;
    return parseFixed('1', 18).toString();
  }
}
