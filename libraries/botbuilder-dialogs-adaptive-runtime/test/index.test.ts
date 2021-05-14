// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import sinon from 'sinon';
import { AuthenticationConfiguration, AuthenticationConstants, SkillValidation } from 'botframework-connector';
import { BlobsStorage } from 'botbuilder-azure-blobs';
import { BotComponent, BotFrameworkAdapter, MemoryStorage } from 'botbuilder';
import { Configuration, getRuntimeServices } from '../src';
import { ConfigurationConstants } from '../src/configurationConstants';
import { CosmosDbPartitionedStorage } from 'botbuilder-azure';
import { ServiceCollection, Configuration as CoreConfiguration } from 'botbuilder-dialogs-adaptive-runtime-core';
import { ok, rejects, strictEqual } from 'assert';

describe('getRuntimeServices', function () {
    it('works', async function () {
        const [services] = await getRuntimeServices(__dirname, __dirname);
        ok(services);
        ok(services.makeInstances());
    });

    it('works with preset configuration', async function () {
        const [services] = await getRuntimeServices(__dirname, new Configuration());
        ok(services);
        ok(services.makeInstances());
    });

    it('merges composer configuration', async function () {
        const [, configuration] = await getRuntimeServices(__dirname, __dirname);
        ok(configuration);

        // Ensure bot root is merged in
        strictEqual(configuration.string(['BotRoot']), '.');

        // Ensure resolved luis endpoint is merged in
        strictEqual(configuration.string(['luis', 'endpoint']), 'https://westus.api.cognitive.microsoft.com');

        // Ensure that a setting in a generated file is merged in
        strictEqual(configuration.string(['luis', 'fancySetting']), 'fancyValue');

        // Ensure that a setting in a generated file takes precedence over appsettings
        strictEqual(configuration.string(['luis', 'override']), 'new value');
    });

    it('supports bot components and late binding configuration', async function () {
        class MyComponent extends BotComponent {
            configureServices(services: ServiceCollection, configuration: CoreConfiguration): void {
                services.composeFactory<Map<string, BotFrameworkAdapter>>('customAdapters', (customAdapters) => {
                    const name = configuration.get(['customAdapter', 'name']);
                    ok(typeof name === 'string');

                    customAdapters.set(name, new BotFrameworkAdapter());

                    return customAdapters;
                });
            }
        }

        const [services, configuration] = await getRuntimeServices(__dirname, __dirname);

        const myComponent = new MyComponent();

        await Promise.resolve(myComponent.configureServices(services, configuration));

        configuration.set(['customAdapter', 'name'], 'foo');

        const customAdapter = services.mustMakeInstance<Map<string, BotFrameworkAdapter>>('customAdapters');
        ok(customAdapter.get('foo'));
    });

    describe('storage', function () {
        it('defaults to memory storage', async function () {
            const [services] = await getRuntimeServices(__dirname, __dirname);
            ok(services);

            const storage = services.mustMakeInstance('storage');
            ok(storage instanceof MemoryStorage);
        });

        it('supports blobs storage', async function () {
            const configuration = new Configuration().argv().env();

            configuration.set([ConfigurationConstants.RuntimeSettingsKey, 'storage'], 'BlobsStorage');

            configuration.set(['BlobsStorage'], {
                connectionString: 'UseDevelopmentStorage=true',
                containerName: 'containerName',
            });

            const [services] = await getRuntimeServices(__dirname, configuration);
            ok(services);

            const storage = services.mustMakeInstance('storage');
            ok(storage instanceof BlobsStorage);
        });

        it('supports cosmos storage', async function () {
            const configuration = new Configuration().argv().env();

            configuration.set([ConfigurationConstants.RuntimeSettingsKey, 'storage'], 'CosmosDbPartitionedStorage');

            configuration.set(['CosmosDbPartitionedStorage'], {
                authKey: 'authKey',
                cosmosDBEndpoint: 'cosmosDbEndpoint',
                containerId: 'containerId',
                databaseId: 'databaseId',
            });

            const [services] = await getRuntimeServices(__dirname, configuration);
            ok(services);

            const storage = services.mustMakeInstance('storage');
            ok(storage instanceof CosmosDbPartitionedStorage);
        });
    });

    describe('skills', function () {
        let sandbox: sinon.SinonSandbox;
        beforeEach(function () {
            sandbox = sinon.createSandbox();
            sandbox.stub(SkillValidation, 'isSkillClaim').returns(true);
        });

        afterEach(function () {
            sandbox.restore();
        });

        it('supports .runtimeSettings.skills', async function () {
            const configuration = new Configuration();

            configuration.set(['runtimeSettings', 'skills'], {
                allowedCallers: ['AppId'],
            });

            const [services] = await getRuntimeServices(__dirname, configuration);
            const authenticationConfiguration = services.mustMakeInstance<AuthenticationConfiguration>(
                'authenticationConfiguration'
            );

            const { validateClaims } = authenticationConfiguration;
            ok(validateClaims);

            await validateClaims([
                {
                    type: AuthenticationConstants.AppIdClaim,
                    value: 'AppId',
                },
            ]);

            await rejects(
                validateClaims([
                    {
                        type: AuthenticationConstants.AppIdClaim,
                        value: 'BadAppId',
                    },
                ])
            );
        });

        it('supports .skills', async function () {
            const configuration = new Configuration();

            configuration.set(['skills'], {
                a: {
                    msAppId: 'AppA',
                },
                b: {
                    msAppId: 'AppB',
                },
            });

            const [services] = await getRuntimeServices(__dirname, configuration);
            const authenticationConfiguration = services.mustMakeInstance<AuthenticationConfiguration>(
                'authenticationConfiguration'
            );

            const { validateClaims } = authenticationConfiguration;
            ok(validateClaims);

            await Promise.all([
                validateClaims([
                    {
                        type: AuthenticationConstants.AppIdClaim,
                        value: 'AppA',
                    },
                ]),
                validateClaims([
                    {
                        type: AuthenticationConstants.AppIdClaim,
                        value: 'AppB',
                    },
                ]),
            ]);

            await rejects(
                validateClaims([
                    {
                        type: AuthenticationConstants.AppIdClaim,
                        value: 'AppC',
                    },
                ])
            );
        });
    });
});
