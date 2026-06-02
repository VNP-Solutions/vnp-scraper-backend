import { CreateNoteDto, UpdateNoteDto } from './notes.dto';

export interface INotesRepository {
  create(data: CreateNoteDto): Promise<any>;
  findById(id: string): Promise<any>;
  findAllByQuery(query: Record<string, any>): Promise<{ data: any[]; metadata: any }>;
  update(id: string, data: UpdateNoteDto): Promise<any>;
  delete(id: string): Promise<any>;
}

export interface INotesService {
  create(data: CreateNoteDto): Promise<any>;
  findById(id: string): Promise<any>;
  findAll(query: Record<string, any>): Promise<{ data: any[]; metadata: any }>;
  update(id: string, data: UpdateNoteDto): Promise<any>;
  delete(id: string): Promise<any>;
}
