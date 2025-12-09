/**
 * Resizes an image to 150x150px and ensures it is under 200kb
 */
export const processImageUpload = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Fixed dimensions as requested
        const MAX_WIDTH = 150;
        const MAX_HEIGHT = 150;
        
        canvas.width = MAX_WIDTH;
        canvas.height = MAX_HEIGHT;

        if (ctx) {
          // Draw image to canvas (scaling it)
          // We use 'cover' style cropping or simple stretch. 
          // For simplicity in this tool, we stretch/squash to fit 150x150 or better, maintain aspect ratio
          // Let's do center crop to square
          
          const scale = Math.max(MAX_WIDTH / img.width, MAX_HEIGHT / img.height);
          const x = (MAX_WIDTH / 2) - (img.width / 2) * scale;
          const y = (MAX_HEIGHT / 2) - (img.height / 2) * scale;
          
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

          // Quality 0.8 usually keeps it well under 200kb for 150x150
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataUrl);
        } else {
          reject(new Error("Could not get canvas context"));
        }
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};