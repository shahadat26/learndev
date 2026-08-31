import { PartialType } from '@nestjs/swagger';

import { CreateProductDto } from './create-product.dto';

/** Every field optional; PATCH semantics - omitted fields are left untouched. */
export class UpdateProductDto extends PartialType(CreateProductDto) {}
