import { NextRequest, NextResponse } from 'next/server';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { LitNodeClient, encryptString, decryptToString } from '@lit-protocol/lit-node-client';
import { LitNetwork } from '@lit-protocol/constants';
import { ethers } from 'ethers';
import {
  LitAccessControlConditionResource,
  LitAbility,
  createSiweMessageWithRecaps,
  generateAuthSig,
} from '@lit-protocol/auth-helpers';

declare global {
  interface Window {
    ethereum: any;
  }
}

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

const connectToLitNode = async () => {
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
  const providerUrl = 'https://eth-sepolia.g.alchemy.com/v2/i7Vc1mNsVst_Lgc6OUcQDDMtnI50f-kk';
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
  const wallet = ethers.Wallet.createRandom()

  return new ethers.Wallet(wallet.privateKey, provider);

  // return new ethers.Wallet(process.env.PK as `0x${string}`, provider);
};

const encryptData = async ({ client, message }: { client: LitNodeClient; message: string }) => {
  const { ciphertext, dataToEncryptHash } = await encryptString(
    {
      accessControlConditions,
      dataToEncrypt: message,
    },
    client
  );

  return { ciphertext, dataToEncryptHash };
};

const decryptData = async ({
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
    if (error?.errorCode === 'NodeAccessControlConditionsReturnedNotAuthorized') {
      throw new Error('You do not meet the conditions required to view this content.');
    }
    throw error;
  }
};

async function fetchWithRetry(url: string, options: AxiosRequestConfig, retries = 5, delay = 1000): Promise<AxiosResponse> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempt ${i + 1} to fetch from ${url}`);
      const response = await axios(url, options);
      console.log(`Successful response on attempt ${i + 1}`);
      return response;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i < retries - 1) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        console.error('Max retries reached');
        throw error;
      }
    }
  }
  throw new Error('Max retries reached');
}

export async function POST(req: NextRequest) {
  try {
    console.log('Received POST request');
    const { inputs } = await req.json();
    console.log('Parsed request body:', { inputs });

    const pk = process.env.PK;
    if (!pk) {
      throw new Error('PK environment variable is not set');
    }
    const module = 'cowsay:v0.0.3';
    const body = {
      pk: pk,
      module: module,
      inputs: `-i Message='${inputs}'`,
      opts: { stream: true },
    };

    console.log('Constructed request body:', body);

    const requestOptions: AxiosRequestConfig = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      data: body,
    };

    console.log('Request options:', requestOptions);

    const response = await fetchWithRetry('http://js-cli-wrapper.lilypad.tech', requestOptions);
    const data = response.data;

    console.log('Fetched data:', data);

    // Encrypt the response data using Lit Protocol
    const client = await connectToLitNode();
    console.log('Connected to LIT node');
    const encryptedData = await encryptData({ client, message: JSON.stringify(data) });
    console.log('Encrypted data:', encryptedData);

    // Decrypt the response data using Lit Protocol (for demonstration)
    try {
      const decryptedData = await decryptData({ client, ciphertext: encryptedData.ciphertext, dataToEncryptHash: encryptedData.dataToEncryptHash });
      console.log('Decrypted data:', decryptedData);
      await client.disconnect();
      return NextResponse.json(decryptedData);
    } catch (decryptError: any) {
      console.error('Decryption failed:', decryptError?.message);
      await client.disconnect();
      return NextResponse.json({ error: decryptError?.message }, { status: 403 });
    }

  } catch (error) {
    console.error('Error during POST request:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
