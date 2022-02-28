# defi-pancake-swap
To automate pancake swap yield farming

Given that :
- It is connected to BSC prod
- Test with wallet starting with '0x263', private key is hided on submission
- ABI can be fetched from bscscan or /src/abis 

Steps:
1. Check pending cakes to be harvasted (Line 231)
2. Harvast CAKE : interact with MasterChef and deposit 0 (line 238)
3. Swap half CAKE to BNB: interact with Reouter and call swap function (line 252)
4. Add liquidity by forming CAKE-BNB LP: interact with router and call add liquidity function (line 269)
5. Stake new LP to Farm: interact with Masterchef and call deposit function (By default stake 100% LP)

Optimization:
- Assume APR = 33% (from pancake UI)
- We have: 
    - total estimate gas (in USD)
    - LP supply (From LP contract)
    - LP reserve (From LP contract)
    - My staked amount (From Farm contract)
    - BNB and CAKE market price (Binance API)
- We are able to calucualte capitial with below formula:
    - Stake Portion = staked amount / LP supply
    - Captial = Stake Portion * BNB reserve * BNB price + Stake Portion * CAKE reserve * CAKE price
- By applying APY formula:
    - gas = [ (1 + r / n)^t -1 ] * capital
- We could get optimal tenor with this formula
    - t = log( 1 + gas / capital ) / log( 1 + r / n )
- The function would return optimal hour if breakeven point in terms of day is less than 0

Video Demo:
- Introduction of workflow:               https://youtu.be/ttBfK-rVDlQ
- Demostration of making transactions:    https://youtu.be/dvtjNyN665I


Ideal log (Numbers would change if transactions were triggered):
```
erickung@Erics-MBP defi-pancake-swap % node auto_farm_cake_bnb.js
*************************
Balance checking ..
main | 0.261907255780755687 BNB
CAKE | 0.440415389543002087
WBNB | 0.010522479290321854
CAKE-LP | 0.004544691121472045
*************************
Operation Starts .. 
Step 1 -  Pending CAKEs |  0.000018923677382232
CAKE-LP | 0.004544691121472045
Reinvest amount:  0
Step 2 -  Harvasted |  0.000018923677382232 CAKEs | Est gas : 111420
Step 3 - Swapping 0.000009 CAKE into BNB | Est gas : 162796
     >>  0.000009 CAKE ->  0.000000155502880837 WBNB
Step 4 - Adding Liquidity | Est gas : 208030
CAKE-LP | 0.004544691121472045
     >>  Balance of LP : 4544691121472045
CAKE-LP | 0.004544691121472045
Reinvest amount:  0.00454
Step 5 - Staking all LP balance to the Farm | Est gas : 136413
CAKE-LP | 0.004544691121472045
     >>  Latest Balance of LP : 4544691121472045
Esti Total Gas:  618659
*************************
**** Optimization ****
Step 1 - Calculating my capital (Staked LP value)
CAKE @ 6.2415027183237018172934030543 | BNB @ 360.3393137606602746192683131864
APR: assume to be 33%
Gas for an action 1.1146357975592818 USD
Getting CakeLP supply information .. 
Pool Suuply:  2146529378289740633195221 LP -  consists of 16974419543684367586211806 CAKE | 294020734011902780101691 BNB
I am staking 0.253463275375852574 LP, and worth USD 25.020446290573648
Finding APY breakeven point .. 
Optimal Point: Compound every  48.2 Days
```
