import { supabase } from './supabaseClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Processes an image file: Resizes it client-side (Canvas) and uploads to Supabase Storage.
 * Returns the public URL of the uploaded file.
 * 
 * PRE-REQUISITE: Create a public bucket named 'images' in Supabase and set RLS policies.
 */
export const processImageUpload = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Basic validation
    if (!file) {
        reject(new Error("Nenhum arquivo fornecido"));
        return;
    }

    if (!file.type.startsWith('image/')) {
        reject(new Error("O arquivo deve ser uma imagem"));
        return;
    }

    const reader = new FileReader();
    
    reader.onload = (event) => {
      const img = new Image();
      
      img.onload = async () => {
        try {
            // 2. Resize Logic (Canvas)
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Defined dimensions (Increased slightly from base64 version for better quality on buckets)
            const MAX_WIDTH = 500;
            const MAX_HEIGHT = 500;
            
            if (!ctx) throw new Error("Falha ao inicializar contexto de imagem");

            let width = img.width;
            let height = img.height;

            // Maintain aspect ratio logic
            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }
            
            canvas.width = width;
            canvas.height = height;

            // Draw image to canvas
            ctx.drawImage(img, 0, 0, width, height);

            // 3. Convert to Blob
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    reject(new Error("Falha ao processar a imagem (Blob)"));
                    return;
                }

                // 4. Upload to Supabase Storage
                // Clean filename to avoid issues
                const fileExt = 'jpg';
                const fileName = `${uuidv4()}.${fileExt}`;
                const filePath = `${fileName}`; 

                // Ensure bucket exists first (handled by SQL usually, but upload fails if not)
                const { data, error: uploadError } = await supabase.storage
                    .from('images')
                    .upload(filePath, blob, {
                        contentType: 'image/jpeg',
                        cacheControl: '3600',
                        upsert: true
                    });

                if (uploadError) {
                    console.error("Erro Supabase Storage:", uploadError);
                    reject(new Error(`Erro no upload: ${uploadError.message}`));
                    return;
                }

                // 5. Get Public URL
                const { data: urlData } = supabase.storage
                    .from('images')
                    .getPublicUrl(filePath);

                if (!urlData || !urlData.publicUrl) {
                    reject(new Error("Erro ao obter URL pública da imagem"));
                    return;
                }

                resolve(urlData.publicUrl);

            }, 'image/jpeg', 0.85); // 85% quality JPEG

        } catch (err: any) {
            console.error("Erro no processamento da imagem:", err);
            reject(new Error(err.message || "Erro desconhecido ao processar imagem"));
        }
      };
      
      img.onerror = () => reject(new Error("Falha ao carregar a imagem para processamento"));
      
      // Load image source
      if (event.target?.result) {
          img.src = event.target.result as string;
      } else {
          reject(new Error("Falha na leitura do arquivo"));
      }
    };
    
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo localmente"));
    
    // Start reading
    reader.readAsDataURL(file);
  });
};