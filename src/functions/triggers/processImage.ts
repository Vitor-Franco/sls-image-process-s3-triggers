import type { S3Event } from "aws-lambda";
import { getS3Object } from "../../utils/getS3Object";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { extractFileInfo } from "../../utils/extractFileInfo";
import { s3Client } from "../../clients/s3Client";
import { getS3ObjectMetadata } from "../../utils/getS3ObjectMetadata";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { env } from "../../config/env";
import { dynamoClient } from "../../clients/dynamoClient";

export async function handler(event: S3Event) {
	await Promise.all(
		event.Records.map(async (record) => {
			const { bucket, object } = record.s3;

			const bucketName = bucket.name;
			const bucketKey = object.key;

			const s3Payload = {
				bucket: bucketName,
				key: bucketKey,
			};

			const [file, metadata] = await Promise.all([
				getS3Object(s3Payload),
				getS3ObjectMetadata(s3Payload),
			]);

			console.log(file);
			console.log(metadata);

			const liveId = metadata.liveid;

			if (!liveId) {
				return;
			}

			const [imageHD, imageSD, placeholderImage] = await Promise.all([
				sharp(file.file)
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
				sharp(file.file)
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
				sharp(file.file)
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

			const { fileName } = extractFileInfo(bucketKey);
			const thumbnailKeyHD = `processed/${fileName}_hd.webp`; // processed/ to avoid loop in trigger processing
			const thumbnailKeySD = `processed/${fileName}_sd.webp`;
			const thumbnailKeyPlaceholder = `processed/${fileName}_placeholder.webp`;

			const hdPutObject = new PutObjectCommand({
				Bucket: bucketName,
				Key: thumbnailKeyHD,
				Body: imageHD,
				Metadata: {
					liveid: liveId,
				},
			});

			const sdPutObject = new PutObjectCommand({
				Bucket: bucketName,
				Key: thumbnailKeySD,
				Body: imageSD,
				Metadata: {
					liveid: liveId,
				},
			});

			const placeholderPutObject = new PutObjectCommand({
				Bucket: bucketName,
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
