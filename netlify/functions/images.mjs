import { uploadImage, getImage, deleteImage } from './_blob-storage.mjs';
import sharp from 'sharp';

/**
 * @param {Request} req
 * @param {import("@netlify/functions").Context} [context]
 */
export default async function handler(req, context) {
  const httpMethod = req.method || 'GET';
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const imageId = url.searchParams.get('id');
  const size = url.searchParams.get('size');

  try {
    // GET - Retrieve an image
    if (httpMethod === 'GET' && imageId) {
      const imageResult = await getImage(imageId);
      if (!imageResult) {
        return new Response('Image not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      let imageData = imageResult.data;
      let contentType = imageResult.metadata.contentType || 'image/jpeg';

      // Generate thumbnail if requested
      if (size === 'thumb') {
        try {
          console.log(`Generating thumbnail for image ${imageId}, original size: ${imageResult.data.length} bytes, content-type: ${contentType}`);

          // Use Sharp to resize to 200x200px square with cover fit
          imageData = await sharp(imageResult.data)
            .resize(200, 200, {
              fit: 'cover',
              position: 'center'
            })
            .jpeg({
              quality: 80,
              progressive: true
            })
            .toBuffer();

          contentType = 'image/jpeg';
          console.log(`Thumbnail generated successfully for ${imageId}, new size: ${imageData.length} bytes`);
        } catch (resizeError) {
          console.error(`Thumbnail generation failed for ${imageId}:`, {
            error: resizeError.message,
            stack: resizeError.stack,
            originalSize: imageResult.data.length,
            contentType: contentType
          });
          // Fall back to original image if resizing fails
          console.log(`Falling back to original image for ${imageId}`);
        }
      }

      return new Response(imageData, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
        }
      });
    }

    // POST - Upload an image
    if (httpMethod === 'POST') {
      const contentType = req.headers.get('content-type');

      if (!contentType || !contentType.startsWith('multipart/form-data')) {
        return new Response(JSON.stringify({ error: 'Content-Type must be multipart/form-data' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const formData = await req.formData();
      const file = formData.get('image');

      if (!file || !file.size) {
        return new Response(JSON.stringify({ error: 'No image file provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        return new Response(JSON.stringify({
          error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Validate file size (5MB limit)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        return new Response(JSON.stringify({
          error: 'File too large. Maximum size is 5MB'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

       // Generate unique image ID
       const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

       // Convert file to buffer for processing
       const arrayBuffer = await file.arrayBuffer();
       const originalBuffer = Buffer.from(arrayBuffer);

       // Auto-orient the image based on EXIF data to fix iPhone portrait orientation issues
       let processedBuffer;
       try {
         console.log(`Processing image ${imageId} for auto-orientation, original size: ${originalBuffer.length} bytes`);

         // Use Sharp to auto-rotate based on EXIF orientation and maintain quality
         processedBuffer = await sharp(originalBuffer)
           .rotate() // Automatically rotates based on EXIF orientation data
           .jpeg({
             quality: 90, // Maintain high quality while allowing some compression
             progressive: true
           })
           .toBuffer();

         console.log(`Image auto-orientation completed for ${imageId}, processed size: ${processedBuffer.length} bytes`);
       } catch (orientationError) {
         console.warn(`Auto-orientation failed for ${imageId}, using original image:`, orientationError.message);
         // Fall back to original buffer if orientation processing fails
         processedBuffer = originalBuffer;
       }

       await uploadImage(imageId, processedBuffer, 'image/jpeg'); // Store as JPEG after processing

      return new Response(JSON.stringify({
        success: true,
        imageId: imageId,
        url: `/.netlify/functions/images?id=${imageId}`
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // POST - Reprocess existing image for orientation (backward compatibility)
    if (httpMethod === 'POST' && action === 'reprocess' && imageId) {
      try {
        // Get the existing image
        const imageResult = await getImage(imageId);
        if (!imageResult) {
          return new Response(JSON.stringify({ error: 'Image not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        console.log(`Reprocessing existing image ${imageId} for auto-orientation`);

        // Auto-orient the existing image
        const processedBuffer = await sharp(imageResult.data)
          .rotate() // Automatically rotates based on EXIF orientation data
          .jpeg({
            quality: 90, // Maintain high quality
            progressive: true
          })
          .toBuffer();

        // Replace the existing image with the oriented version
        await uploadImage(imageId, processedBuffer, 'image/jpeg');

        console.log(`Successfully reprocessed image ${imageId}, new size: ${processedBuffer.length} bytes`);

        return new Response(JSON.stringify({
          success: true,
          imageId: imageId,
          message: 'Image reprocessed successfully'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (reprocessError) {
        console.error(`Reprocessing failed for image ${imageId}:`, reprocessError);
        return new Response(JSON.stringify({
          error: 'Reprocessing failed',
          details: reprocessError.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // DELETE - Delete an image
    if (httpMethod === 'DELETE' && imageId) {
      await deleteImage(imageId);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Images handler error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}