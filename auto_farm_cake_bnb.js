import Web3 from "web3";
import fetch from "node-fetch";
import fs from "fs"
import { getHeapSpaceStatistics } from "v8";

const gas_price = '1'
var accu_gas = 0
var actual_gas = 0
const walletAddress = {
    main: {address: 'address', pk: 'privateKey'}
}

const connection = {
    bsc : {
        host:'https://bsc-dataseed.binance.org/', 
        symbol:'BNB',
        abi_prefix: 'https://api.bscscan.com/api?module=contract&action=getabi&address='
    }
}

const contract_dict = {
    cake: {contract: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', symbol: 'CAKE'},
    wbnb: {contract: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB'},
    cakelp:  {contract: '0x0eD7e52944161450477ee417DE9Cd3a859b14fD0', symbol: 'CAKE-LP'},
}

const swap_dict = {
    pancake: {router: '0x10ed43c718714eb63d5aa57b78b54704e256024e', farm: '0x73feaa1ee314f8c655e354234017be2193c9e24e', pid: '251'}
}


// Connect to prod
const web3 = new Web3(Web3.givenProvider || connection.bsc.host);
const deadline_txn = web3.utils.toHex(Math.round(Date.now()/1000)+60*20)   

// Function to get ABI
async function get_abi(contract_address) {                           
    const bscscan_url = connection.bsc.abi_prefix + contract_address.toLowerCase();
    const ABI = await fetch(bscscan_url)
    .then(res => res.json())
    .then(result => JSON.parse(result.result));     
    return ABI
}

// Function to get price of token
async function tokenPrice(contract_address) {                           
    const cakeapi = 'https://api.pancakeswap.info/api/v2/tokens/' + contract_address.toLowerCase();
    const price = await fetch(cakeapi)
    .then(res => res.json())
    .then(result => result.data.price);     
    return price
}

// Convert readable amount to Wei
function tokenWei (_amount) {
    return web3.utils.toWei(_amount)
}

// Convert Wei to readable amount
function tokenWeiR (_amount) {
    return web3.utils.fromWei(_amount)
}

// Read local ABI
function localABI(filename) {
    return JSON.parse(fs.readFileSync('src/abis/' + filename + '.txt').toString())
}

// interact with contract
async function contractInit (_contract_address, localabi) {
    let abi;
    if (localabi === undefined) {
        abi = await get_abi(_contract_address)
    }
    else {
        abi = localabi
    };

    const contract = new web3.eth.Contract(
        abi, 
        _contract_address, 
        {from: walletAddress.main.address}
    );
    return contract
}

// Check my BNB balance
function get_eth_balance(add_name) {
    web3.eth.getBalance(walletAddress[add_name].address).then(
        return_balance => {
            console.log(add_name, '|', web3.utils.fromWei(return_balance), connection.bsc.symbol);
        }
    );
}

// Function to check token balance
async function TokenBal(token_name, localabi) {
    const token_info = contract_dict[token_name]
    let abi;
    if (localabi === undefined) {
        abi = await get_abi(token_info.contract)
    }
    else {
        abi = localabi
    };
    const contract = new web3.eth.Contract(abi, token_info.contract);
    const bal = await contract.methods.balanceOf(walletAddress.main.address).call();
    console.log(token_info.symbol, '|', web3.utils.fromWei(bal));
    return bal;
}

// Function to sign and send transactions
async function build_txn(
    from_addr, 
    to_addr,
    contract_data,
    contract_value
    ) {
    var tx = {
        from: from_addr,
        to: to_addr,
        gas: gas_price,
        gasLimit: 500000,
        data: contract_data,
        value: contract_value
      };
      var tx_for_gas = {
        from: from_addr,
        to: to_addr,
        data: contract_data,
        value: contract_value
      };
    return [tx, tx_for_gas]
}

async function gasEsti(tx) {
    const exp_gas = gas_price * await web3.eth.estimateGas(tx)
    accu_gas = accu_gas + exp_gas
    return exp_gas
}

async function send_txn(tx, private_key) {
    var signedTx = await web3.eth.accounts.signTransaction(tx, private_key)
    const swap_receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
    console.log('Reference: ', swap_receipt.transactionHash)
    console.log('Gas Spent: ', swap_receipt.gasUsed)
    actual_gas = actual_gas + swap_receipt.gasUsed
    return swap_receipt.gasUsed
}



// Interact With Pancake
const swapRouter = await contractInit(swap_dict.pancake.router, localABI('cakeRouter'))
const swapFarm = await contractInit(swap_dict.pancake.farm, localABI('cakeFarm'))

// CAKE to BNB converter
async function eqvBNBamt(_amount) {
    const eqvBNB = await swapRouter.methods.getAmountsOut(
        tokenWei(_amount),
        [contract_dict.cake.contract, contract_dict.wbnb.contract]    // eqv BNB
    ).call()
    return eqvBNB
}

// Swap cake to BNB
async function SwapCakeToWBNB(_amount) {
    const eqvBNB = await eqvBNBamt(_amount)
    const swap_data = await swapRouter.methods.swapExactTokensForTokens(
        eqvBNB[0],                                                  // amountIn (cake)
        eqvBNB[1],                                                  // amount Out
        [contract_dict.cake.contract, contract_dict.wbnb.contract], // path : CAKE > BNB
        walletAddress.main.address,                                 // address
        deadline_txn                                                // deadline
    ).encodeABI()

    return swap_data;
}

async function SwapCakeToBNB(_amount) {
    const eqvBNB = await eqvBNBamt(_amount)
    const swap_data = await swapRouter.methods.swapExactTokensForETH(
        eqvBNB[0],                                                  // amountIn (cake)
        eqvBNB[1],                                                  // amount Out
        [contract_dict.cake.contract, contract_dict.wbnb.contract], // path : CAKE > BNB
        walletAddress.main.address,                                 // address
        deadline_txn                                                // deadline
    ).encodeABI()

    return swap_data;
}


// Add liquidity
const cake_to_pair = await eqvBNBamt('0.01');
const add_liquidity = await swapRouter.methods.addLiquidityETH(
    contract_dict.cake.contract,
    cake_to_pair[0],                        // amountTokenDesired
    (cake_to_pair[0] * 0.95).toString(),    // amountTokenMin
    cake_to_pair[1],                        // amountETHMin
    walletAddress.main.address,             // to
    deadline_txn                            // deadline
).encodeABI()

// Stake to / Harvast from the farm
async function StakeHarvast(stake_ratio = 0.2) {

    const lpBal = await TokenBal('cakelp', localABI('erc20'));
    const lpReinvest = tokenWei((tokenWeiR(lpBal) * stake_ratio).toFixed(5).toString());
    console.log('Reinvest amount: ', tokenWeiR(lpReinvest))
    const stakeLP = await swapFarm.methods.deposit(swap_dict.pancake.pid, lpReinvest).encodeABI();

    return stakeLP
};


async function pendingCake() {
    return await swapFarm.methods.pendingCake(swap_dict.pancake.pid, walletAddress.main.address).call()
}

// ****************************************************************
// // Function Call
console.log('*************************')
console.log('Balance checking ..')
await get_eth_balance('main');
await TokenBal('cake', localABI('erc20'));
await TokenBal('wbnb', localABI('erc20'));
await TokenBal('cakelp', localABI('erc20'));



// // Step 0 - Check Pending Cakes
console.log('*************************')
console.log('Operation Starts .. ')

const pendingReward = await pendingCake()
console.log('Step 1 - ', 'Pending CAKEs | ', tokenWeiR(pendingReward))

// // Step 1 - Harvest CAKE from CAKE-BNB farm
const signed_Harvast = await build_txn(    
    walletAddress.main.address,
    swap_dict.pancake.farm,
    await StakeHarvast(0),    // Harvast if reinvestment = 0
    '0',    
    walletAddress.main.pk
)
const gas_Harvest = gasEsti(signed_Harvast[1])
await send_txn(signed_Harvast[0], walletAddress.main.pk)
console.log('Step 2 - ','Harvasted | ', tokenWeiR(pendingReward), 'CAKEs', '|', 'Est gas :', await gas_Harvest)


// // Step 2 - Swap CAKE to BNB (1:1)
// // swap CAKE to BNB
const cakeToBeSwapped = (tokenWeiR(pendingReward) / 2).toFixed(6).toString()
const signed_swap = await build_txn(    
    walletAddress.main.address,
    swap_dict.pancake.router,
    await SwapCakeToBNB(cakeToBeSwapped),
    '0',    
    walletAddress.main.pk
)   
const gas_swap = gasEsti(signed_swap[1])
await send_txn(signed_swap[0], walletAddress.main.pk)
console.log('Step 3 -', 'Swapping', cakeToBeSwapped, 'CAKE into BNB', '|', 'Est gas :', await gas_swap)
await eqvBNBamt(cakeToBeSwapped).then(
    x => console.log( '     >> ',tokenWeiR(x[0]), 'CAKE -> ', tokenWeiR(x[1]), 'WBNB')
)

// // Step 3 - Add Liquidity
// // Add liquidity (from CAKE to LP)
const signed_liquidity = await build_txn(    
    walletAddress.main.address,
    swap_dict.pancake.router,
    add_liquidity,
    cake_to_pair[1],    
    walletAddress.main.pk
)
const gas_liquidity = gasEsti(signed_liquidity[1])
await send_txn(signed_liquidity[0], walletAddress.main.pk)
console.log('Step 4 -', 'Adding Liquidity', '|', 'Est gas :', await gas_liquidity)
await TokenBal('cakelp', localABI('erc20')).then(
    x => console.log('     >> ', 'Balance of LP :', x)
);

// // Step 4 - Stake to Farm
// // Stake to Farm
const signed_stake = await build_txn(    
    walletAddress.main.address,
    swap_dict.pancake.farm,
    await StakeHarvast(1), 
    '0',    
    walletAddress.main.pk
)
const gas_stake= gasEsti(signed_stake[1])
await send_txn(signed_stake[0], walletAddress.main.pk)
console.log('Step 5 -', 'Staking all LP balance to the Farm', '|', 'Est gas :', await gas_stake)
await TokenBal('cakelp', localABI('erc20')).then(
    x => console.log('     >> ', 'Latest Balance of LP :', x)
);

console.log('Esti Total Gas: ', accu_gas)


// Time to Optimize
// So we need to find a point where pending reward = total gas fee :)
console.log('*************************')
console.log('**** Optimization ****')


console.log('Step 1 - Calculating my capital (Staked LP value)')
const cakePrice = await tokenPrice(contract_dict.cake.contract)
const bnbPrice = await tokenPrice(contract_dict.wbnb.contract)
console.log('CAKE @', cakePrice, '|', 'BNB @', bnbPrice)

const gas_paid = accu_gas * 0.000000005 * bnbPrice
const farm_apr = 0.33

console.log('APR: assume to be 33%')
console.log('Gas for an action', gas_paid, 'USD')

console.log('Getting CakeLP supply information .. ')
const clp = await contractInit(contract_dict.cakelp.contract, localABI('cakeLP'))
const clp_reserve = await clp.methods.getReserves().call()
const clp_supply = await clp.methods.totalSupply().call()
const myStakedAmt = await swapFarm.methods.userInfo('251', walletAddress.main.address).call()

console.log('Pool Suuply: ', clp_supply, 'LP - ', 'consists of', clp_reserve._reserve0, 'CAKE', "|", clp_reserve._reserve1, 'BNB')
const myStakePortion = myStakedAmt.amount / clp_supply
const lp_value = myStakePortion * clp_reserve._reserve0 *  cakePrice + myStakePortion * clp_reserve._reserve1 * bnbPrice
console.log('I am staking', tokenWeiR(myStakedAmt.amount), 'LP, and worth USD', tokenWeiR(lp_value.toString()))


console.log('Finding APY breakeven point .. ')

function optimalTenor() {
    // gas = [ (1 + r / n)^t -1 ] * capital
    // log( 1 + gas / capital ) = t log(1 + r / n)
    // t = log( 1 + gas / capital ) / log( 1 + r / n )
    const tenor_day = (t) => {
        return Math.log( 1 + gas_paid / tokenWeiR(lp_value.toString())) / Math.log(1 + farm_apr / t)
    }
    // return tenor
    if (tenor_day(365) > 0) {
        console.log('Optimal Point: Compound every ', tenor_day(365).toFixed(1), 'Days');
        return tenor_day(365).toFixed(1);
    }
    else {
        console.log('Optimal Point: Compound every ', tenor_day(365 * 24).toFixed(1), 'Hours')
        return tenor_day(365 * 24).toFixed(1);
    }
}
optimalTenor();



// APR calculation (Failed)
// const getPoolApr = (
//     stakingTokenPrice,
//     rewardTokenPrice,
//     totalStaked,
//     tokenPerBlock,
//   ) => {
//     const totalRewardPricePerYear = new BigNumber(rewardTokenPrice).times(tokenPerBlock).times(BLOCKS_PER_YEAR)
//     const totalStakingTokenInPool = new BigNumber(stakingTokenPrice).times(totalStaked)
//     const apr = totalRewardPricePerYear.div(totalStakingTokenInPool).times(100)
//   }
