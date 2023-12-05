import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import dts from 'rollup-plugin-dts';
import pkg from './package.json';

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        name: 'balancer-js',
        file: pkg.browser,
        format: 'umd',
        sourcemap: true,
        globals: {
          '@ethersproject/abi': 'abi',
          '@ethersproject/constants': 'constants',
          '@ethersproject/bignumber': 'bignumber',
          '@ethersproject/address': 'address',
          '@ethersproject/bytes': 'bytes',
          '@ethersproject/abstract-signer': 'abstractSigner',
          '@ethersproject/contracts': 'contracts',
          '@balancer-labs/sor': 'sor',
          '@ethersproject/providers': 'providers',
          'graphql-request': 'graphqlRequest',
          'json-to-graphql-query': 'jsonToGraphqlQuery',
          graphql: 'graphql',
          lodash: 'lodash',
          axios: 'axios',
          ethers: 'ethers',
        },
      },
      { file: pkg.main, format: 'cjs', sourcemap: true },
      { file: pkg.module, format: 'es', sourcemap: true },
    ],
    plugins: [
      nodeResolve(),
      json(),
      commonjs(),
      typescript({
        exclude: ['node_modules', '**/*.spec.ts'],
      }),
      terser({
        format: {
          comments: false,
        },
        compress: {
          pure_funcs: ['console.time', 'console.timeEnd'],
        },
      }),
    ],
    external: [...Object.keys(pkg.dependencies), 'ethers'],
  },
  {
    input: 'src/index.ts',
    output: [{ file: 'dist/index.d.ts', format: 'es' }],
    plugins: [dts(), typescript({ exclude: ['node_modules', '**/*.spec.ts'] })],
  },
];
