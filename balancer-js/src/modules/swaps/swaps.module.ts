import { SOR, SubgraphPoolBase, SwapInfo, SwapTypes } from '@balancer-labs/sor';
import { Vault__factory, Vault } from '@balancer-labs/typechain';
import {
  BatchSwap,
  QuerySimpleFlashSwapParameters,
  QuerySimpleFlashSwapResponse,
  QueryWithSorInput,
  QueryWithSorOutput,
  SimpleFlashSwapParameters,
  FindRouteParameters,
  BuildTransactionParameters,
  SwapAttributes,
  SwapType,
} from './types';
import {
  queryBatchSwap,
  queryBatchSwapWithSor,
  getSorSwapInfo,
} from './queryBatchSwap';
import { balancerVault } from '@/lib/constants/config';
import { getLimitsForSlippage } from './helpers';
import { BalancerSdkConfig } from '@/types';
import { SwapInput } from './types';
import { Sor } from '@/modules/sor/sor.module';
import {
  convertSimpleFlashSwapToBatchSwapParameters,
  querySimpleFlashSwap,
} from './flashSwap';
import {
  SingleSwapBuilder,
  BatchSwapBuilder,
} from '@/modules/swaps/swap_builder';
import { TokenKind } from 'graphql';

export class Swaps {
  readonly sor: SOR;
  chainId: number;
  vaultContract: Vault;

  // TODO: sorOrConfig - let's make it more predictable and always pass configuration explicitly
  constructor(sorOrConfig: SOR | BalancerSdkConfig) {
    if (sorOrConfig instanceof SOR) {
      this.sor = sorOrConfig;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.chainId = (<any>this.sor.provider)['_network']['chainId'];
    } else {
      this.sor = new Sor(sorOrConfig);
      this.chainId = sorOrConfig.network as number;
    }

    this.vaultContract = Vault__factory.connect(
      balancerVault,
      this.sor.provider
    );
  }

  static getLimitsForSlippage(
    tokensIn: string[],
    tokensOut: string[],
    swapType: SwapType,
    deltas: string[],
    assets: string[],
    slippage: string
  ): string[] {
    // TO DO - Check best way to do this?
    const limits = getLimitsForSlippage(
      tokensIn,
      tokensOut,
      swapType,
      deltas,
      assets,
      slippage
    );

    return limits.map((l) => l.toString());
  }

  /**
   * Uses SOR to find optimal route for a trading pair and amount
   *
   * @param FindRouteParameters
   * @param FindRouteParameters.tokenIn Address
   * @param FindRouteParameters.tokenOut Address
   * @param FindRouteParameters.amount BigNumber with a trade amount
   * @param FindRouteParameters.gasPrice BigNumber current gas price
   * @param FindRouteParameters.maxPools number of pool included in path
   * @returns Best trade route information
   */
  async findRouteGivenIn({
    tokenIn,
    tokenOut,
    amount,
    gasPrice,
    maxPools = 4,
    useBpts,
  }: FindRouteParameters): Promise<SwapInfo> {
    return this.sor.getSwaps(
      tokenIn,
      tokenOut,
      SwapTypes.SwapExactIn,
      amount,
      {
        gasPrice,
        maxPools,
      },
      useBpts
    );
  }

  /**
   * Uses SOR to find optimal route for a trading pair and amount
   *
   * @param FindRouteParameters
   * @param FindRouteParameters.tokenIn Address
   * @param FindRouteParameters.tokenOut Address
   * @param FindRouteParameters.amount BigNumber with a trade amount
   * @param FindRouteParameters.gasPrice BigNumber current gas price
   * @param FindRouteParameters.maxPools number of pool included in path
   * @param FindRouteParameters.useBpts boolean whether to allow bpts in paths
   * @returns Best trade route information
   */
  async findRouteGivenOut({
    tokenIn,
    tokenOut,
    amount,
    gasPrice,
    maxPools,
    useBpts,
  }: FindRouteParameters): Promise<SwapInfo> {
    return this.sor.getSwaps(
      tokenIn,
      tokenOut,
      SwapTypes.SwapExactOut,
      amount,
      {
        gasPrice,
        maxPools,
      },
      useBpts
    );
  }

  /**
   * Uses SOR to find optimal route for a trading pair and amount
   *
   * @param BuildTransactionParameters
   * @param BuildTransactionParameters.userAddress Address
   * @param BuildTransactionParameters.swapInfo result of route finding
   * @param BuildTransactionParameters.kind 0 - givenIn, 1 - givenOut
   * @param BuildTransactionParameters.deadline BigNumber block timestamp
   * @param BuildTransactionParameters.maxSlippage [bps], eg: 1 === 0.01%, 100 === 1%
   * @returns transaction request ready to send with signer.sendTransaction
   */
  buildSwap({
    userAddress,
    recipient,
    swapInfo,
    kind,
    deadline,
    maxSlippage,
  }: BuildTransactionParameters): SwapAttributes {
    if (!this.chainId) throw 'Missing network configuration';

    // one vs batch (gas cost optimisation when using single swap)
    const builder =
      swapInfo.swaps.length > 1
        ? new BatchSwapBuilder(swapInfo, kind, this.chainId)
        : new SingleSwapBuilder(swapInfo, kind, this.chainId);
    builder.setFunds(userAddress, recipient);
    builder.setDeadline(deadline);
    builder.setLimits(maxSlippage);

    const to = builder.to();
    const { functionName } = builder;
    const attributes = builder.attributes();
    const data = builder.data();
    const value = builder.value(maxSlippage);

    return { to, functionName, attributes, data, value };
  }

  /**
   * Encode batchSwap in an ABI byte string
   *
   * [See method for a batchSwap](https://dev.balancer.fi/references/contracts/apis/the-vault#batch-swaps).
   *
   * _NB: This method doesn't execute a batchSwap -- it returns an [ABI byte string](https://docs.soliditylang.org/en/latest/abi-spec.html)
   * containing the data of the function call on a contract, which can then be sent to the network to be executed.
   * (ex. [sendTransaction](https://web3js.readthedocs.io/en/v1.2.11/web3-eth.html#sendtransaction)).
   *
   * @param {BatchSwap}           batchSwap - BatchSwap information used for query.
   * @param {SwapType}            batchSwap.kind - either exactIn or exactOut
   * @param {BatchSwapSteps[]}    batchSwap.swaps - sequence of swaps
   * @param {string[]}            batchSwap.assets - array contains the addresses of all assets involved in the swaps
   * @param {FundManagement}      batchSwap.funds - object containing information about where funds should be taken/sent
   * @param {number[]}            batchSwap.limits - limits for each token involved in the swap, where either the maximum number of tokens to send (by passing a positive value) or the minimum amount of tokens to receive (by passing a negative value) is specified
   * @param {string}              batchSwap.deadline -  time (in Unix timestamp) after which it will no longer attempt to make a trade
   * @returns {string}            encodedBatchSwapData - Returns an ABI byte string containing the data of the function call on a contract
   */
  static encodeBatchSwap(batchSwap: BatchSwap): string {
    const vaultInterface = Vault__factory.createInterface();

    return vaultInterface.encodeFunctionData('batchSwap', [
      batchSwap.kind,
      batchSwap.swaps,
      batchSwap.assets,
      batchSwap.funds,
      batchSwap.limits,
      batchSwap.deadline,
    ]);
  }

  /**
   * Encode simple flash swap into a ABI byte string
   *
   * A "simple" flash swap is an arbitrage executed with only two tokens and two pools,
   * swapping in the first pool and then back in the second pool for a profit. For more
   * complex flash swaps, you will have to use the batch swap method.
   *
   * Learn more: A [Flash Swap](https://dev.balancer.fi/resources/swaps/flash-swaps).
   *
   * @param {SimpleFlashSwapParameters}   params - BatchSwap information used for query.
   * @param {string}                      params.flashLoanAmount - initial input amount for the flash loan (first asset)
   * @param {string[]}                    params.poolIds - array of Balancer pool ids
   * @param {string[]}                    params.assets - array of token addresses
   * @param {string}                      params.walletAddress - array of token addresses
   * @returns {string}                    encodedBatchSwapData - Returns an ABI byte string containing the data of the function call on a contract
   */
  static encodeSimpleFlashSwap(params: SimpleFlashSwapParameters): string {
    return this.encodeBatchSwap(
      convertSimpleFlashSwapToBatchSwapParameters(params)
    );
  }

  /**
   * fetchPools saves updated pools data to SOR internal onChainBalanceCache.
   * @param {SubgraphPoolBase[]} [poolsData=[]] If poolsData passed uses this as pools source otherwise fetches from config.subgraphUrl.
   * @param {boolean} [isOnChain=true] If isOnChain is true will retrieve all required onChain data via multicall otherwise uses subgraph values.
   * @returns {boolean} Boolean indicating whether pools data was fetched correctly (true) or not (false).
   */
  async fetchPools(): Promise<boolean> {
    return this.sor.fetchPools();
  }

  public getPools(useBpts?: boolean): SubgraphPoolBase[] {
    return this.sor.getPools(useBpts);
  }

  /**
   * queryBatchSwap simulates a call to `batchSwap`, returning an array of Vault asset deltas.
   * @param batchSwap - BatchSwap information used for query.
   * @param {SwapType} batchSwap.kind - either exactIn or exactOut.
   * @param {BatchSwapStep[]} batchSwap.swaps - sequence of swaps.
   * @param {string[]} batchSwap.assets - array contains the addresses of all assets involved in the swaps.
   * @returns {Promise<string[]>} Returns an array with the net Vault asset balance deltas. Positive amounts represent tokens (or ETH) sent to the
   * Vault, and negative amounts represent tokens (or ETH) sent by the Vault. Each delta corresponds to the asset at
   * the same index in the `assets` array.
   */
  async queryBatchSwap(
    batchSwap: Pick<BatchSwap, 'kind' | 'swaps' | 'assets'>
  ): Promise<string[]> {
    return await queryBatchSwap(
      this.vaultContract,
      batchSwap.kind,
      batchSwap.swaps,
      batchSwap.assets
    );
  }

  /**
   * Uses SOR to create and query a batchSwap.
   * @param {QueryWithSorInput} queryWithSor - Swap information used for querying using SOR.
   * @param {string[]} queryWithSor.tokensIn - Array of addresses of assets in.
   * @param {string[]} queryWithSor.tokensOut - Array of addresses of assets out.
   * @param {SwapType} queryWithSor.swapType - Type of Swap, ExactIn/Out.
   * @param {string[]} queryWithSor.amounts - Array of amounts used in swap.
   * @param {FetchPoolsInput} queryWithSor.fetchPools - Set whether SOR will fetch updated pool info.
   * @returns {Promise<QueryWithSorOutput>} Returns amount of tokens swaps along with swap and asset info that can be submitted to a batchSwap call.
   */
  async queryBatchSwapWithSor(
    queryWithSor: QueryWithSorInput
  ): Promise<QueryWithSorOutput> {
    return await queryBatchSwapWithSor(
      this.sor,
      this.vaultContract,
      queryWithSor
    );
  }

  /**
   * Simple interface to test if a simple flash swap is valid and see potential profits.
   *
   * A "simple" flash swap is an arbitrage executed with only two tokens and two pools,
   * swapping in the first pool and then back in the second pool for a profit. For more
   * complex flash swaps, you will have to use the batch swap method.
   *
   * Learn more: A [Flash Swap](https://dev.balancer.fi/resources/swaps/flash-swaps).
   *
   * _NB: This method doesn't execute a flashSwap
   *
   * @param {SimpleFlashSwapParameters}   params - BatchSwap information used for query.
   * @param {string}                      params.flashLoanAmount - initial input amount for the flash loan (first asset)
   * @param {string[]}                    params.poolIds - array of Balancer pool ids
   * @param {string[]}                    params.assets - array of token addresses
   * @returns {Promise<{profits: Record<string, string>, isProfitable: boolean}>}       Returns an ethersjs transaction response
   */
  async querySimpleFlashSwap(
    params: Omit<QuerySimpleFlashSwapParameters, 'vaultContract'>
  ): Promise<QuerySimpleFlashSwapResponse> {
    return await querySimpleFlashSwap({
      ...params,
      vaultContract: this.vaultContract,
    });
  }

  /**
   * Use SOR to get swapInfo for tokenIn<>tokenOut.
   * @param {SwapInput} swapInput - Swap information used for querying using SOR.
   * @param {string} swapInput.tokenIn - Addresse of asset in.
   * @param {string} swapInput.tokenOut - Addresse of asset out.
   * @param {SwapType} swapInput.swapType - Type of Swap, ExactIn/Out.
   * @param {string} swapInput.amount - Amount used in swap.
   * @returns {Promise<SwapInfo>} SOR swap info.
   */
  async getSorSwap(swapInput: SwapInput): Promise<SwapInfo> {
    return await getSorSwapInfo(
      swapInput.tokenIn,
      swapInput.tokenOut,
      swapInput.swapType,
      swapInput.amount,
      this.sor
    );
  }

  async formatSwapsForGnosis(
    swapInfo: SwapInfo,
    referenceToken: string,
    relayerAddress: string,
    callData: string,
    useBpts?: boolean
  ): Promise<string> {
    const amountIn = swapInfo.swapAmount.toString();
    const amountOut = swapInfo.returnAmount.toString();
    let output = '';
    const pools = this.getPools(useBpts);
    const swaps = swapInfo.swaps;
    interface Token {
      [address: string]: {
        alias: string;
        decimals: number;
      };
    }
    const tokens: Set<Token> = new Set();
    for (const swap of swaps) {
      const pool = pools.find(
        (value) => value.id == swap.poolId
      ) as SubgraphPoolBase;
      // pool.tokens[0].
      for (const poolToken of pool.tokens) {
        const token: Token = {
          [poolToken.address]: {
            alias: '', // where can we get alias from?
            decimals: poolToken.decimals,
          },
        };
        tokens.add(token);
      }
    }
    const tokensArray: Token[] = Array.from(tokens);
    const cowSwapOrder = {
      ref_token: referenceToken,
      prices: {},
      orders: {},
      amms: {},
      foreign_liquidity_orders: [],
      approvals: [
        {
          token: swapInfo.tokenIn,
          spender: relayerAddress,
          amount: amountIn,
        },
      ],
      interaction_data: [
        {
          target: relayerAddress,
          value: '0x0',
          call_data_hex: callData,
          inputs: [
            {
              amount: amountIn,
              token: swapInfo.tokenIn,
            },
          ],
          outputs: [
            {
              amount: amountOut,
              token: swapInfo.tokenOut,
            },
          ],
          exec_plan: {
            sequence: 0,
            position: 1,
          },
        },
      ],
      tokens: tokensArray,
    };
    output = JSON.stringify(cowSwapOrder, null, 2) + '\n' + output;
    return output;
  }
}
