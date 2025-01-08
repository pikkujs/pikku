import { CoreUserSession, SessionServices } from "../../types/core.types.js"
import { closeSessionServices } from "../../utils.js"
import { processMessageHandlers } from "../channel-handler.js"
import { getChannels, openChannel } from "../channel-runner.js"
import type { CoreAPIChannel, RunChannelOptions, RunChannelParams, VrameworkChannelHandlerFactory } from "../channel.types.js"
import { createHTTPInteraction, handleError } from "../../http/http-route-runner.js"
import { ChannelStore } from "../channel-store.js"

export interface RunServerlessChannelParams<ChannelData> extends RunChannelParams<ChannelData> {
    channelStore: ChannelStore
    channelHandlerFactory: VrameworkChannelHandlerFactory
    channelObject?: unknown
}

const getVariablesForChannel = ({ channelId, userSession, channelName, channelHandlerFactory, openingData }: {
    channelId: string,
    channelName: string,
    userSession?: CoreUserSession,
    channelHandlerFactory: VrameworkChannelHandlerFactory,
    openingData?: unknown
}) => {
    const { channels } = getChannels()
    const channelConfig = channels.find(channelConfig => channelConfig.name === channelName)
    if (!channelConfig) {
        throw new Error(`Channel not found: ${channelName}`)
    }
    const channelHandler = channelHandlerFactory(
        channelId,
        channelConfig.name,
        openingData,
        userSession
    )
    return {
        channelConfig,
        channelHandler,
        channel: channelHandler.getChannel()
    }
}

export const runChannelConnect = async ({
    singletonServices,
    channelId,
    channelObject,
    request,
    response,
    route,
    createSessionServices,
    channelStore,
    channelHandlerFactory,
    coerceToArray = false,
    logWarningsForStatusCodes = [],
    respondWith404 = true,
    bubbleErrors = false
}: Pick<CoreAPIChannel<unknown, any>, 'route'> &
    RunChannelOptions &
    RunServerlessChannelParams<unknown>) => {
    let sessionServices: SessionServices | undefined
    const http = createHTTPInteraction(request, response)
    try {
        const { userSession, channelConfig, openingData } = await openChannel({
            channelId,
            createSessionServices,
            http,
            route,
            singletonServices,
            coerceToArray
        })
        await channelStore.addChannel({ channelId, channelName: channelConfig.name, openingData, channelObject })
        const { channel } = getVariablesForChannel({ 
            channelId, 
            userSession, 
            channelHandlerFactory, 
            channelName: channelConfig.name
        })
        if (createSessionServices) {
            sessionServices = await createSessionServices(singletonServices, { http }, userSession)
        }
        await channelConfig.onConnect?.({ ...singletonServices, ...sessionServices }, channel)
        http?.response?.setStatus(101)
    } catch (e: any) {
        handleError(
            e,
            http,
            channelId,
            singletonServices.logger,
            logWarningsForStatusCodes,
            respondWith404,
            bubbleErrors
        )
    } finally {
        if (sessionServices) {
            await closeSessionServices(singletonServices.logger, sessionServices)
        }
    }
}

export const runChannelDisconnect = async ({ singletonServices, ...params }: RunServerlessChannelParams<unknown>): Promise<void> => {
    let sessionServices: SessionServices | undefined
    const { userSession, openingData, channelName } = await params.channelStore.getChannel(params.channelId)
    const { channel, channelConfig } = getVariablesForChannel({
        ...params,
        userSession,
        openingData,
        channelName
    })
    if (!sessionServices && params.createSessionServices) {
        sessionServices = await params.createSessionServices(singletonServices, {}, userSession)
    }
    await channelConfig.onDisconnect?.({ ...singletonServices, ...sessionServices }, channel)
    await params.channelStore.removeChannels([channel.channelId])
    if (sessionServices) {
        await closeSessionServices(singletonServices.logger, sessionServices)
    }
}

export const runChannelMessage = async ({ singletonServices, ...params }: RunServerlessChannelParams<unknown>, data: unknown): Promise<unknown> => {
    let sessionServices: SessionServices | undefined
    const { userSession, openingData, channelName } = await params.channelStore.getChannel(params.channelId)
    const { channelHandler, channelConfig } = getVariablesForChannel({
        ...params,
        userSession,
        openingData,
        channelName
    })
    if (params.createSessionServices) {
        sessionServices = await params.createSessionServices(singletonServices, {}, userSession)
    }
    let response: unknown
    try {
        const onMessage = processMessageHandlers(
            { ...singletonServices, ...sessionServices },
            channelConfig,
            channelHandler,
        )
        response = await onMessage(data)
    } finally {
        if (sessionServices) {
            await closeSessionServices(singletonServices.logger, sessionServices)
        }
    }
    return response
}
