"use client";

import { Editor } from "@tinymce/tinymce-react";
import { useRef, useState, useEffect } from "react";

interface DocumentTemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  onInsertVariable?: (variable: string) => void;
  availableVariables?: Array<{ key: string; label: string }>;
  placeholder?: string;
}

export default function DocumentTemplateEditor({
  value,
  onChange,
  onInsertVariable,
  availableVariables = [],
  placeholder = "Введите HTML содержимое...",
}: DocumentTemplateEditorProps) {
  const editorRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Кастомная кнопка для вставки переменных
  const VariableButton = ({ variable }: { variable: string }) => {
    const handleClick = () => {
      if (editorRef.current) {
        const editor = editorRef.current;
        const variableText = `{{${variable}}}`;
        editor.insertContent(variableText);
      } else {
        // Fallback
        const variableText = `{{${variable}}}`;
        onChange(value + variableText);
      }
    };

    return (
      <button
        type="button"
        onClick={handleClick}
        className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
        title={`Вставить {{${variable}}}`}
      >
        {availableVariables.find((v) => v.key === variable)?.label || variable}
      </button>
    );
  };

  if (!mounted) {
    return (
      <div className="h-64 animate-pulse rounded-md border border-gray-300 bg-gray-200 dark:border-gray-600 dark:bg-gray-700" />
    );
  }

  return (
    <div className="space-y-2">
      {availableVariables.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-md border border-gray-300 bg-gray-50 p-2 dark:border-gray-600 dark:bg-gray-800">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Переменные:
          </span>
          {availableVariables.map((variable) => (
            <VariableButton key={variable.key} variable={variable.key} />
          ))}
        </div>
      )}
      
      <div className="rounded-md border border-gray-300 dark:border-gray-600">
        <Editor
          apiKey={process.env.NEXT_PUBLIC_TINYMCE_API_KEY || "jziw5a7l1lo950sg84szhecytri3mw3duu03j8sqexrgb3jm"}
          onInit={(evt, editor) => {
            editorRef.current = editor;
            // Убеждаемся, что редактор не в режиме read-only
            editor.mode.set("design");
          }}
          value={value}
          onEditorChange={(content) => onChange(content)}
          disabled={false}
          init={{
            menubar: true,
            height: 500,
            plugins: [
              "advlist",
              "autolink",
              "lists",
              "link",
              "image",
              "charmap",
              "preview",
              "anchor",
              "searchreplace",
              "visualblocks",
              "code",
              "fullscreen",
              "insertdatetime",
              "media",
              "table",
              "code",
              "help",
              "wordcount",
              "pagebreak",
            ],
            toolbar:
              "undo redo | blocks | " +
              "bold italic underline strikethrough | forecolor backcolor | " +
              "alignleft aligncenter alignright alignjustify | " +
              "bullist numlist outdent indent | " +
              "removeformat | help | code | pagebreak",
            content_style:
              "body { font-family: 'Times New Roman', serif; font-size: 14pt; line-height: 1.5; margin: 2cm; }",
            // Настройки для точного форматирования как в Word
            paste_as_text: false,
            paste_auto_cleanup_on_paste: true,
            paste_remove_styles: false,
            paste_retain_style_properties: "all",
            // Настройки для печати/PDF
            pagebreak_separator: "<!-- pagebreak -->",
            // Поддержка точных отступов и выравнивания
            indent_use_margins: true,
            indent_bottom: false,
            // Настройки шрифтов
            font_formats:
              "Andale Mono=andale mono,times; Arial=arial,helvetica,sans-serif; Arial Black=arial black,avant garde; Book Antiqua=book antiqua,palatino; Comic Sans MS=comic sans ms,sans-serif; Courier New=courier new,courier; Georgia=georgia,palatino; Helvetica=helvetica; Impact=impact,chicago; Symbol=symbol; Tahoma=tahoma,arial,helvetica,sans-serif; Terminal=terminal,monaco; Times New Roman=times new roman,times; Trebuchet MS=trebuchet ms,geneva; Verdana=verdana,geneva; Webdings=webdings; Wingdings=wingdings,zapf dingbats",
            // Настройки для точного контроля форматирования
            visual: true,
            visual_table_class: "mce-item-table",
            visual_anchor_class: "mce-item-anchor",
            // Поддержка темной темы
            skin: "oxide",
            content_css: "default",
            // Настройки для работы с переменными
            valid_elements: "*[*]",
            extended_valid_elements: "*[*]",
            // Настройки для точного отображения как в Word
            convert_urls: false,
            relative_urls: false,
            remove_script_host: false,
            // Настройки для печати
            print_template_callback: (template: string) => {
              return template.replace(
                /<body[^>]*>/,
                '<body style="font-family: Times New Roman, serif; font-size: 14pt; line-height: 1.5; margin: 2cm;">'
              );
            },
          }}
        />
      </div>
      
      <style jsx global>{`
        .tox-tinymce {
          border-radius: 0.375rem;
        }
        .tox .tox-edit-area__iframe {
          background-color: white;
        }
        .dark .tox .tox-edit-area__iframe {
          background-color: #1f2937;
        }
        .dark .tox-tinymce {
          border-color: #374151;
        }
        .dark .tox .tox-toolbar,
        .dark .tox .tox-toolbar__overflow,
        .dark .tox .tox-toolbar__primary {
          background-color: #1f2937;
          border-color: #374151;
        }
        .dark .tox .tox-menubar {
          background-color: #1f2937;
          border-color: #374151;
        }
        .dark .tox .tox-menu,
        .dark .tox .tox-collection {
          background-color: #1f2937;
          border-color: #374151;
        }
        .dark .tox .tox-menu__label,
        .dark .tox .tox-collection__item {
          color: #f3f4f6;
        }
        .dark .tox .tox-menu__label:hover,
        .dark .tox .tox-collection__item:hover {
          background-color: #374151;
        }
      `}</style>
    </div>
  );
}
