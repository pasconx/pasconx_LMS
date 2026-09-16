import app from './app.js';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`   PASCONX Video Portal Backend API                  `);
  console.log(`   Running on: http://localhost:${PORT}              `);
  console.log(`   Provider:   ${process.env.VIDEO_PROVIDER || 'youtube'}`);
  console.log(`   Mode:       ${process.env.NODE_ENV || 'development'}`);
  console.log(`====================================================`);
});
