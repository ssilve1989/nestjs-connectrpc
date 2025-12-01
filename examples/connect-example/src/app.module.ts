import { Module } from '@nestjs/common';
import { ExampleModule } from './example/example.module.js';

@Module({
  imports: [ExampleModule],
})
export class AppModule {}
