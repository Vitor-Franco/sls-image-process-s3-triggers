import type { SQSEvent } from "aws-lambda";
import { getS3Object } from "../../utils/getS3Object";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { extractFileInfo } from "../../utils/extractFileInfo";
import { s3Client } from "../../clients/s3Client";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { env } from "../../config/env";
import { dynamoClient } from "../../clients/dynamoClient";

export async function handler(event: SQSEvent) {
	await Promise.all(
		event.Records.map(async (record) => {
			const { bucket, key } = JSON.parse(record.body);

			const s3Payload = {
				bucket,
				key,
			};

			const { file, metadata } = await getS3Object(s3Payload);

			const liveId = metadata.liveid;

			if (!liveId) {
				return;
			}

			const [imageHD, imageSD, placeholderImage] = await Promise.all([
				sharp(file)
					.resize({
						width: 1280,
						height: 720,
						background: "#000",
						fit: "contain",
					})
					.toFormat("webp", {
						quality: 80,
					})
					.toBuffer(),
				sharp(file)
					.resize({
						width: 640,
						height: 360,
						background: "#000",
						fit: "contain",
					})
					.toFormat("webp", {
						quality: 80,
					})
					.toBuffer(),
				sharp(file)
					.resize({
						width: 124,
						height: 70,
						background: "#000",
						fit: "contain",
					})
					.toFormat("webp", {
						quality: 80,
					})
					.blur(5)
					.toBuffer(),
			]);

			const { fileName } = extractFileInfo(key);
			const thumbnailKeyHD = `processed/${fileName}_hd.webp`; // processed/ to avoid loop in trigger processing
			const thumbnailKeySD = `processed/${fileName}_sd.webp`;
			const thumbnailKeyPlaceholder = `processed/${fileName}_placeholder.webp`;

			const hdPutObject = new PutObjectCommand({
				Bucket: bucket,
				Key: thumbnailKeyHD,
				Body: imageHD,
				Metadata: {
					liveid: liveId,
				},
			});

			const sdPutObject = new PutObjectCommand({
				Bucket: bucket,
				Key: thumbnailKeySD,
				Body: imageSD,
				Metadata: {
					liveid: liveId,
				},
			});

			const placeholderPutObject = new PutObjectCommand({
				Bucket: bucket,
				Key: thumbnailKeyPlaceholder,
				Body: placeholderImage,
				Metadata: {
					liveid: liveId,
				},
			});

			const updateCommand = new UpdateCommand({
				TableName: env.LIVES_TABLE,
				Key: {
					id: liveId,
				},
				UpdateExpression:
					"set #hdThumbnailKey = :hdThumbnailKey, #sdThumbnailKey = :sdThumbnailKey, #placeholderThumbnailKey = :placeholderThumbnailKey",
				ExpressionAttributeNames: {
					"#hdThumbnailKey": "hdThumbnailKey",
					"#sdThumbnailKey": "sdThumbnailKey",
					"#placeholderThumbnailKey": "placeholderThumbnailKey",
				},
				ExpressionAttributeValues: {
					":hdThumbnailKey": thumbnailKeyHD,
					":sdThumbnailKey": thumbnailKeySD,
					":placeholderThumbnailKey": thumbnailKeyPlaceholder,
				},
			});

			await Promise.all([
				dynamoClient.send(updateCommand),
				s3Client.send(hdPutObject),
				s3Client.send(sdPutObject),
				s3Client.send(placeholderPutObject),
			]);
		}),
	);
}
