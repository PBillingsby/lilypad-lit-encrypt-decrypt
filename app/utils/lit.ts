import { LitNodeClient, encryptString, decryptToString } from '@lit-protocol/lit-node-client';
import { LitNetwork } from '@lit-protocol/constants';
import { ethers } from 'ethers';
import {
  LitAccessControlConditionResource,
  LitAbility,
  createSiweMessageWithRecaps,
  generateAuthSig,
} from '@lit-protocol/auth-helpers';

const accessControlConditions = [
  {
    contractAddress: '0x71114745941707ACAeCf3C756c012d2388d4A943',
    standardContractType: 'ERC20',
    chain: 'sepolia',
    method: 'balanceOf',
    parameters: [':userAddress'],
    returnValueTest: {
      comparator: '>',
      value: '0', // User must have more than 0 tokens
    },
  },
];

export const connectToLitNode = async () => {
  const client = new LitNodeClient({
    alertWhenUnauthorized: false,
    litNetwork: LitNetwork.Cayenne,
    debug: false,
  });
  console.log('Client done: ', client);
  await client.connect();
  console.log('Connected Client');
  return client;
};

const initializeProvider = async () => {
  const providerUrl = `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
  console.log(`Connecting to Ethereum provider at ${providerUrl}`);

  try {
    const provider = new ethers.providers.JsonRpcProvider(providerUrl);
    const network = await provider.getNetwork(); // This will throw an error if the network is not reachable
    console.log('Connected to Ethereum network:', network);
    return provider;
  } catch (error) {
    console.error('Error connecting to Ethereum provider:', error);
    throw error; // Re-throw the error after logging it
  }
};

const genWallet = async () => {
  const provider = await initializeProvider();
  // known private key for testing, replace with your own key
  const wallet = ethers.Wallet.createRandom();

  return new ethers.Wallet(wallet.privateKey, provider);

  // return new ethers.Wallet(process.env.PK as `0x${string}`, provider);
};

export const encryptData = async ({ client, message }: { client: LitNodeClient; message: string }) => {
  const { ciphertext, dataToEncryptHash } = await encryptString(
    {
      accessControlConditions,
      dataToEncrypt: message,
    },
    client
  );

  return { ciphertext, dataToEncryptHash };
};

export const decryptData = async ({
  client,
  ciphertext,
  dataToEncryptHash,
}: {
  client: LitNodeClient;
  ciphertext: string;
  dataToEncryptHash: string;
}) => {
  console.log('Starting decryption process...');

  try {
    console.log('Requesting session signatures...');
    const sessionSigs = await client.getSessionSigs({
      chain: 'sepolia',
      resourceAbilityRequests: [
        {
          resource: new LitAccessControlConditionResource('*'),
          ability: LitAbility.AccessControlConditionDecryption,
        },
      ],
      authNeededCallback: async (params: any) => {
        console.log('Auth needed callback triggered...');
        const latestBlockhash = await client.getLatestBlockhash();
        console.log('Latest block hash:', latestBlockhash);

        const wallet = await genWallet();
        console.log('Wallet generated:', wallet.address);

        const toSign = await createSiweMessageWithRecaps({
          uri: params.uri,
          expiration: params.expiration,
          resources: params.resourceAbilityRequests,
          walletAddress: wallet.address,
          nonce: latestBlockhash,
          litNodeClient: client,
        });
        console.log('SIWE message created:', toSign);

        const authSig = await generateAuthSig({ signer: wallet, toSign });
        console.log('Auth signature generated:', authSig);

        return authSig;
      },
    });
    console.log('Session signatures obtained:', sessionSigs);

    console.log('Decrypting string...');
    const decryptedString = await decryptToString(
      {
        accessControlConditions,
        chain: 'sepolia',
        ciphertext,
        dataToEncryptHash,
        sessionSigs,
      },
      client
    );
    console.log('Decryption successful:', decryptedString);

    return { decryptedString };
  } catch (error: any) {
    console.error('Error during decryption process:', error);
    if (error.message.includes('NodeAccessControlConditionsReturnedNotAuthorized')) {
      return { error: 'You do not have access to this content.' };
    }
    throw error;
  }
};
