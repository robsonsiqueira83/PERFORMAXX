import { supabase } from './supabaseClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Processes an image file: Resizes it client-side (Canvas) and uploads to Supabase Storage.
 * Returns the public URL of the uploaded file.
 * 
 * PRE-REQUISITE: Create a public bucket named 'images' in Supabase.
 */
export const processImageUpload = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    // 1. Read file locally
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = async () => {
        try {
            // 2. Resize Logic (Canvas)
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Defined dimensions (Increased slightly from base64 version for better quality on buckets)
            const MAX_WIDTH = 400;
            const MAX_HEIGHT = 400;
            
            canvas.width = MAX_WIDTH;
            canvas.height = MAX_HEIGHT;

            if (!ctx) throw new Error("Canvas Context Failed");

            // Draw image to canvas (Center Crop / Cover logic)
            const scale = Math.max(MAX_WIDTH / img.width, MAX_HEIGHT / img.height);
            const x = (MAX_WIDTH / 2) - (img.width / 2) * scale;
            const y = (MAX_HEIGHT / 2) - (img.height / 2) * scale;
            
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

            // 3. Convert to Blob
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    reject(new Error("Blob conversion failed"));
                    return;
                }

                // 4. Upload to Supabase Storage
                // Assumes a bucket named 'images' exists
                const fileExt = 'jpg';
                const fileName = `${uuidv4()}.${fileExt}`;
                const filePath = `${fileName}`; 

                const { error: uploadError } = await supabase.storage
                    .from('images')
                    .upload(filePath, blob, {
                        contentType: 'image/jpeg',
                        cacheControl: '3600',
                        upsert: false
                    });

                if (uploadError) {
                    console.error("Supabase Storage Upload Error:", uploadError);
                    throw uploadError;
                }

                // 5. Get Public URL
                const { data } = supabase.storage
                    .from('images')
                    .getPublicUrl(filePath);

                resolve(data.publicUrl);

            }, 'image/jpeg', 0.85); // 85% quality JPEG

        } catch (err) {
            console.error("Image processing/upload error:", err);
            reject(err);
        }
      };
      
      img.onerror = (err) => reject(new Error("Image loading failed"));
    };
    
    reader.onerror = (err) => reject(err);
  });
};