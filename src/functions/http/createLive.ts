import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { response } from "../../utils/response";
import { z } from "zod";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { env } from "../../config/env";
import { randomUUID } from "node:crypto";
import { dynamoClient } from "../../clients/dynamoClient";
import { extractFileInfo } from "../../utils/extractFileInfo";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../../clients/s3Client";
import { PutObjectCommand } from "@aws-sdk/client-s3";

const schema = z.object({
	title: z.string().min(1),
	number: z.number().min(0),
	fileName: z.string().min(0),
});

export async function handler(event: APIGatewayProxyEventV2) {
	const body = JSON.parse(event.body ?? "{}");

	const { success, data, error } = schema.safeParse(body);

	if (!success) {
		return response(400, {
			error: error.issues,
		});
	}

	const { number, title, fileName: filePath } = data;

	const { extension } = extractFileInfo(filePath);

	const liveId = randomUUID();
	const thumbnailKey = `uploads/${randomUUID()}.${extension}`; // processed/ to avoid loop in trigger processing

	const livePutItemCommand = new PutCommand({
		TableName: env.LIVES_TABLE,
		Item: {
			id: liveId,
			number,
			title,
			thumbnailKey,
		},
	});

	const putObjectCommand = new PutObjectCommand({
		Bucket: env.LIVES_IMAGES_BUCKET,
		Key: thumbnailKey,
		Metadata: {
			liveid: liveId,
		},
	});

	const uploadURL = await getSignedUrl(s3Client, putObjectCommand, {
		expiresIn: 600,
	});

	await dynamoClient.send(livePutItemCommand);

	return response(201, {
		id: liveId,
		uploadURL,
	});
}
